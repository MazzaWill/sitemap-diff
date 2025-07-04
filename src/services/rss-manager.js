/**
 * RSS 管理器
 * 对应原 Python 项目的 services/rss/manager.py
 * 使用 Cloudflare KV 存储替代文件系统
 */

import { parseXML, extractURLs, getAllContentURLs, isSitemapIndex } from './xml-parser.js';

export class RSSManager {
  constructor(kvStorage) {
    this.kv = kvStorage;
    this.feedsKey = 'rss_feeds';
  }

  /**
   * 获取所有监控的 feeds
   * @returns {Promise<string[]>} feeds 列表
   */
  async getFeeds() {
    try {
      const feedsJson = await this.kv.get(this.feedsKey);
      return feedsJson ? JSON.parse(feedsJson) : [];
    } catch (error) {
      console.error('读取 feeds 失败:', error);
      return [];
    }
  }

  /**
   * 下载并保存 sitemap 文件
   * @param {string} url - sitemap 的 URL
   * @returns {Promise<Object>} 结果对象
   */
  async downloadSitemap(url) {
    try {
      console.log(`尝试下载 sitemap: ${url}`);

      const domain = new URL(url).hostname;
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

      // 检查今天是否已经更新过
      const lastUpdateKey = `last_update_${domain}`;
      const lastUpdate = await this.kv.get(lastUpdateKey);

      // 临时注释掉日期检查，方便测试
      /*
      if (lastUpdate === today) {
        // 今天已经更新过，比较现有文件
        const currentContent = await this.kv.get(`sitemap_current_${domain}`);
        const latestContent = await this.kv.get(`sitemap_latest_${domain}`);

        if (currentContent && latestContent) {
          const newUrls = this.compareSitemaps(currentContent, latestContent);
          return {
            success: true,
            errorMsg: "今天已经更新过此sitemap, 但没发送",
            datedFile: null,
            newUrls
          };
        }

        return {
          success: true,
          errorMsg: "今天已经更新过此sitemap",
          datedFile: null,
          newUrls: []
        };
      }
      */

      // 使用新的递归解析功能获取所有实际内容 URL
      console.log(`🚀 开始递归解析 sitemap: ${url}`);
      const allUrls = await getAllContentURLs(url);
      console.log(`🎯 递归解析结果: 获取到 ${allUrls.length} 个 URL`);
      
      if (allUrls.length === 0) {
        console.error(`❌ 未能获取到任何有效的 URL from ${url}`);
        throw new Error('未能获取到任何有效的 URL');
      }

      console.log(`📝 前 5 个 URL 示例:`, allUrls.slice(0, 5));

      // 将 URL 列表转换为简化的 XML 格式便于存储和比较
      console.log(`🔄 转换 URL 列表为 XML 格式...`);
      const urlListXml = this.createUrlListXml(allUrls);
      console.log(`✅ XML 转换完成，长度: ${urlListXml.length} 字符`);

      let newUrls = [];

      // 如果存在 current 文件，比较差异
      const currentContent = await this.kv.get(`sitemap_current_${domain}`);
      if (currentContent) {
        console.log(`🔍 发现已存在的 sitemap，开始比较差异...`);
        newUrls = this.compareSitemaps(urlListXml, currentContent);
        console.log(`📊 比较结果: 发现 ${newUrls.length} 个新 URL`);
        // 将 current 移动到 latest
        await this.kv.put(`sitemap_latest_${domain}`, currentContent);
        console.log(`💾 已备份当前 sitemap 到 latest`);
      } else {
        console.log(`🆕 这是第一次添加此 sitemap`);
      }

      // 保存新文件
      console.log(`💾 保存新的 sitemap 数据到 KV...`);
      await this.kv.put(`sitemap_current_${domain}`, urlListXml);
      await this.kv.put(`sitemap_dated_${domain}_${today}`, urlListXml);

      // 更新最后更新日期
      await this.kv.put(lastUpdateKey, today);
      console.log(`✅ 数据保存完成`);

      console.log(`🎉 sitemap 处理成功: ${domain}, 包含 ${allUrls.length} 个 URL，${newUrls.length} 个新 URL`);
      return {
        success: true,
        errorMsg: "",
        datedFile: `sitemap_dated_${domain}_${today}`,
        newUrls
      };

    } catch (error) {
      console.error(`下载 sitemap 失败: ${url}`, error);
      return {
        success: false,
        errorMsg: `下载失败: ${error.message}`,
        datedFile: null,
        newUrls: []
      };
    }
  }

  /**
   * 添加 sitemap 监控
   * @param {string} url - sitemap 的 URL
   * @returns {Promise<Object>} 结果对象
   */
  async addFeed(url) {
    try {
      console.log(`尝试添加 sitemap 监控: ${url}`);

      // 验证是否已存在
      const feeds = await this.getFeeds();
      if (!feeds.includes(url)) {
        // 如果是新的 feed，先尝试下载
        const result = await this.downloadSitemap(url);
        if (!result.success) {
          return result;
        }

        // 添加到监控列表
        feeds.push(url);
        await this.kv.put(this.feedsKey, JSON.stringify(feeds));
        console.log(`成功添加 sitemap 监控: ${url}`);
        return {
          ...result,
          errorMsg: result.errorMsg || "成功添加"
        };
      } else {
        // 如果 feed 已存在，仍然尝试下载（可能是新的一天）
        const result = await this.downloadSitemap(url);
        if (!result.success) {
          return result;
        }
        return {
          ...result,
          errorMsg: "已存在的feed更新成功"
        };
      }

    } catch (error) {
      console.error(`添加 sitemap 监控失败: ${url}`, error);
      return {
        success: false,
        errorMsg: `添加失败: ${error.message}`,
        datedFile: null,
        newUrls: []
      };
    }
  }

  /**
   * 删除 RSS 订阅
   * @param {string} url - RSS 订阅链接
   * @returns {Promise<Object>} 结果对象
   */
  async removeFeed(url) {
    try {
      console.log(`尝试删除 RSS 订阅: ${url}`);
      const feeds = await this.getFeeds();

      if (!feeds.includes(url)) {
        console.warn(`RSS 订阅不存在: ${url}`);
        return {
          success: false,
          errorMsg: "该RSS订阅不存在"
        };
      }

      feeds.splice(feeds.indexOf(url), 1);
      await this.kv.put(this.feedsKey, JSON.stringify(feeds));
      console.log(`成功删除 RSS 订阅: ${url}`);
      return {
        success: true,
        errorMsg: ""
      };

    } catch (error) {
      console.error(`删除 RSS 订阅失败: ${url}`, error);
      return {
        success: false,
        errorMsg: `删除失败: ${error.message}`
      };
    }
  }

  /**
   * 将 URL 列表转换为简化的 XML 格式
   * @param {string[]} urls - URL 列表
   * @returns {string} XML 字符串
   */
  createUrlListXml(urls) {
    const xmlParts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ];

    for (const url of urls) {
      xmlParts.push(`  <url><loc>${url}</loc></url>`);
    }

    xmlParts.push('</urlset>');
    return xmlParts.join('\n');
  }

  /**
   * 比较新旧 sitemap，返回新增的 URL 列表
   * @param {string} currentContent - 当前 sitemap 内容
   * @param {string} oldContent - 旧的 sitemap 内容
   * @returns {string[]} 新增的 URL 列表
   */
  compareSitemaps(currentContent, oldContent) {
    try {
      const currentUrls = extractURLs(currentContent);
      const oldUrls = extractURLs(oldContent);

      const newUrls = currentUrls.filter(url => !oldUrls.includes(url));
      console.log(`发现 ${newUrls.length} 个新 URL`);
      return newUrls;

    } catch (error) {
      console.error(`比较 sitemap 失败:`, error);
      return [];
    }
  }

  /**
   * 获取 sitemap 内容
   * @param {string} domain - 域名
   * @param {string} type - 类型 (current, latest, dated)
   * @param {string} date - 日期 (可选，用于 dated 类型)
   * @returns {Promise<string|null>} sitemap 内容
   */
  async getSitemapContent(domain, type = 'current', date = null) {
    try {
      let key;
      switch (type) {
        case 'current':
          key = `sitemap_current_${domain}`;
          break;
        case 'latest':
          key = `sitemap_latest_${domain}`;
          break;
        case 'dated':
          if (!date) {
            date = new Date().toISOString().split('T')[0].replace(/-/g, '');
          }
          key = `sitemap_dated_${domain}_${date}`;
          break;
        default:
          throw new Error(`未知的 sitemap 类型: ${type}`);
      }

      return await this.kv.get(key);
    } catch (error) {
      console.error(`获取 sitemap 内容失败:`, error);
      return null;
    }
  }
} 