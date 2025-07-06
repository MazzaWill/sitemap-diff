/**
 * Google Search Monitor Service
 * 
 * 监控Google搜索结果中特定网站在过去24小时内的新收录页面
 * 使用 site: 操作符和时间过滤器获取最新被Google收录的URL
 */

class GoogleSearchMonitor {
    constructor(storage, notificationManager) {
        this.storage = storage;
        this.notificationManager = notificationManager;
        this.serperApiKey = null; // 从环境变量获取
        this.baseUrl = 'https://google.serper.dev/search';
        
        // 时间过滤器选项
        this.timeFilters = {
            PAST_24_HOURS: 'd',
            PAST_WEEK: 'w',
            PAST_MONTH: 'm',
            PAST_YEAR: 'y'
        };
    }

    /**
     * 初始化服务
     */
    async initialize(config) {
        this.serperApiKey = config.SERPER_API_KEY;
        
        if (!this.serperApiKey) {
            console.warn('Serper API key not configured. Using fallback search method.');
        }
        
        console.log('Google Search Monitor initialized with Serper.dev');
    }

    /**
     * 获取监控的域名列表
     */
    async getMonitoredDomains() {
        try {
            const domainsData = await this.storage.get('google_search_domains');
            return domainsData ? JSON.parse(domainsData) : [];
        } catch (error) {
            console.error('Failed to get monitored domains:', error);
            return [];
        }
    }

    /**
     * 添加域名到Google搜索监控
     */
    async addDomain(domain) {
        try {
            // 验证域名格式
            if (!this.isValidDomain(domain)) {
                throw new Error('Invalid domain format');
            }

            const domains = await this.getMonitoredDomains();
            
            // 检查是否已存在
            if (domains.includes(domain)) {
                return { success: false, message: 'Domain already monitored' };
            }

            domains.push(domain);
            await this.storage.put('google_search_domains', JSON.stringify(domains));
            
            console.log(`Added domain to Google search monitoring: ${domain}`);
            return { success: true, message: 'Domain added successfully' };
        } catch (error) {
            console.error('Failed to add domain:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * 从Google搜索监控中移除域名
     */
    async removeDomain(domain) {
        try {
            const domains = await this.getMonitoredDomains();
            const index = domains.indexOf(domain);
            
            if (index === -1) {
                return { success: false, message: 'Domain not found in monitoring list' };
            }

            domains.splice(index, 1);
            await this.storage.put('google_search_domains', JSON.stringify(domains));
            
            // 清理相关存储数据
            await this.cleanupDomainData(domain);
            
            console.log(`Removed domain from Google search monitoring: ${domain}`);
            return { success: true, message: 'Domain removed successfully' };
        } catch (error) {
            console.error('Failed to remove domain:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * 执行Google搜索监控
     */
    async executeMonitoring() {
        const domains = await this.getMonitoredDomains();
        
        if (domains.length === 0) {
            console.log('No domains configured for Google search monitoring');
            return { success: true, message: 'No domains to monitor' };
        }

        console.log(`Starting Google search monitoring for ${domains.length} domains`);
        
        const results = {
            success: true,
            totalDomains: domains.length,
            processedDomains: 0,
            newUrls: 0,
            errors: []
        };

        for (const domain of domains) {
            try {
                await this.delay(2000); // 延迟避免触发限制
                
                const searchResult = await this.searchDomain(domain);
                const newUrls = await this.processSearchResult(domain, searchResult);
                
                results.processedDomains++;
                results.newUrls += newUrls.length;
                
                if (newUrls.length > 0) {
                    await this.sendNotification(domain, newUrls);
                }
                
                console.log(`Processed domain ${domain}: ${newUrls.length} new URLs`);
            } catch (error) {
                console.error(`Error processing domain ${domain}:`, error);
                results.errors.push({ domain, error: error.message });
            }
        }

        console.log(`Google search monitoring completed. Processed: ${results.processedDomains}/${results.totalDomains}`);
        return results;
    }

    /**
     * 搜索特定域名的最新收录
     */
    async searchDomain(domain, timeFilter = this.timeFilters.PAST_24_HOURS) {
        if (this.serperApiKey) {
            return await this.searchWithSerperApi(domain, timeFilter);
        } else {
            return await this.searchWithFallback(domain);
        }
    }

    /**
     * 使用 Serper API 进行搜索
     */
    async searchWithSerperApi(domain, timeFilter) {
        const requestBody = {
            q: `site:${domain}`,
            tbs: `qdr:${timeFilter}`, // 时间过滤器
            num: 100, // 最多返回100个结果
            page: 1
        };

        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'X-API-KEY': this.serperApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`Serper API request failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(`Serper API error: ${data.error}`);
        }

        return this.extractUrlsFromSerperResponse(data);
    }

    /**
     * 备用搜索方法（无API密钥时使用）
     */
    async searchWithFallback(domain) {
        console.warn(`Using fallback search for domain: ${domain}`);
        
        // 这里可以实现备用搜索逻辑
        // 比如使用网页抓取或其他搜索引擎
        
        return {
            urls: [],
            total: 0,
            source: 'fallback'
        };
    }

    /**
     * 从 Serper API 响应中提取 URL
     */
    extractUrlsFromSerperResponse(data) {
        const urls = [];
        
        if (data.organic) {
            for (const result of data.organic) {
                if (result.link) {
                    urls.push({
                        url: result.link,
                        title: result.title || '',
                        snippet: result.snippet || '',
                        date: result.date || new Date().toISOString(),
                        position: result.position || 0
                    });
                }
            }
        }
        
        return {
            urls,
            total: data.searchInformation?.totalResults || data.organic?.length || 0,
            source: 'serper'
        };
    }

    /**
     * 处理搜索结果并识别新URL
     */
    async processSearchResult(domain, searchResult) {
        const currentUrls = searchResult.urls || [];
        
        if (currentUrls.length === 0) {
            return [];
        }

        // 获取之前的搜索结果
        const storageKey = `google_search_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const previousResultsData = await this.storage.get(storageKey);
        const previousUrls = previousResultsData ? JSON.parse(previousResultsData) : [];

        // 提取之前的URL列表
        const previousUrlSet = new Set(previousUrls.map(item => item.url));
        
        // 找出新URL
        const newUrls = currentUrls.filter(item => !previousUrlSet.has(item.url));
        
        // 更新存储的搜索结果
        await this.storage.put(storageKey, JSON.stringify(currentUrls));
        
        // 更新最后检查时间
        await this.storage.put(`google_search_last_check_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`, new Date().toISOString());
        
        return newUrls;
    }

    /**
     * 发送通知
     */
    async sendNotification(domain, newUrls) {
        const message = this.formatNotificationMessage(domain, newUrls);
        
        try {
            await this.notificationManager.sendNotification(message, 'info');
            console.log(`Sent Google search notification for domain: ${domain}`);
        } catch (error) {
            console.error('Failed to send Google search notification:', error);
        }
    }

    /**
     * 格式化通知消息
     */
    formatNotificationMessage(domain, newUrls) {
        const header = `🔍 **Google 搜索监控更新**\n`;
        const domainInfo = `**域名**: ${domain}\n`;
        const countInfo = `**新收录页面**: ${newUrls.length} 个\n`;
        const timeInfo = `**检查时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`;
        
        let urlsList = '';
        if (newUrls.length > 0) {
            urlsList = '**新收录的页面**:\n';
            newUrls.slice(0, 10).forEach((item, index) => {
                urlsList += `${index + 1}. [${item.title || '无标题'}](${item.url})\n`;
                if (item.snippet) {
                    urlsList += `   ${item.snippet.substring(0, 100)}...\n`;
                }
            });
            
            if (newUrls.length > 10) {
                urlsList += `\n*还有 ${newUrls.length - 10} 个页面未显示*\n`;
            }
        }
        
        return header + domainInfo + countInfo + timeInfo + urlsList;
    }

    /**
     * 获取监控状态
     */
    async getMonitoringStatus() {
        const domains = await this.getMonitoredDomains();
        const status = {
            enabled: true,
            totalDomains: domains.length,
            domains: [],
            lastGlobalCheck: null
        };

        for (const domain of domains) {
            const storageKey = `google_search_last_check_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const lastCheck = await this.storage.get(storageKey);
            
            status.domains.push({
                domain,
                lastCheck: lastCheck || null,
                status: 'active'
            });
        }

        return status;
    }

    /**
     * 清理域名相关数据
     */
    async cleanupDomainData(domain) {
        const safeDomain = domain.replace(/[^a-zA-Z0-9]/g, '_');
        const keys = [
            `google_search_${safeDomain}`,
            `google_search_last_check_${safeDomain}`
        ];

        for (const key of keys) {
            try {
                await this.storage.delete(key);
            } catch (error) {
                console.warn(`Failed to delete key ${key}:`, error);
            }
        }
    }

    /**
     * 验证域名格式
     */
    isValidDomain(domain) {
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        return domainRegex.test(domain);
    }

    /**
     * 延迟函数
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default GoogleSearchMonitor;