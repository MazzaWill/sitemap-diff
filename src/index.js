/**
 * Cloudflare Workers 主入口文件
 * 对应原 Python 项目的 site-bot.py
 */

import { initConfig, validateConfig } from './config.js';
import { RSSManager } from './services/rss-manager.js';
import { notificationManager } from './services/notification-manager.js';
import { handleDiscordInteraction } from './apps/discord-bot.js';
import GoogleSearchMonitor from './services/google-search-monitor.js';

// 全局变量
let rssManager = null;
let googleSearchMonitor = null;

/**
 * 初始化应用
 * @param {Object} env - 环境变量
 */
function initializeApp(env) {
  console.log('🚀 初始化 Site Bot...');

  // 初始化配置
  initConfig(env);

  // 验证配置
  const validation = validateConfig();
  if (!validation.isValid) {
    console.error('❌ 配置验证失败:', validation.errors);
    throw new Error(`配置错误: ${validation.errors.join(', ')}`);
  }

  // 初始化存储和服务
  if (env.SITEMAP_STORAGE) {
    // 初始化 Google 搜索监控器
    googleSearchMonitor = new GoogleSearchMonitor(env.SITEMAP_STORAGE, notificationManager);
    googleSearchMonitor.initialize({
      SERPER_API_KEY: env.SERPER_API_KEY
    });
    console.log('✅ Google 搜索监控器初始化成功');

    // 初始化 RSS 管理器
    rssManager = new RSSManager(env.SITEMAP_STORAGE);
    console.log('✅ RSS 管理器初始化成功');
  } else {
    console.warn('⚠️ 未配置 KV 存储，某些功能可能不可用');
  }

  console.log('✅ Site Bot 初始化完成');
}

/**
 * 执行定时监控任务（只执行sitemap监控，保持原有逻辑）
 * @param {Object} env - 环境变量
 */
async function performScheduledMonitoring(env) {
  try {
    console.log('⏰ 开始执行定时监控任务...');

    if (!rssManager) {
      console.error('❌ RSS 管理器未初始化');
      return;
    }

    const feeds = await rssManager.getFeeds();
    console.log(`📊 检查 ${feeds.length} 个订阅源更新`);

    if (feeds.length === 0) {
      console.log('📭 没有配置的订阅源');
      return;
    }

    // 用于存储所有新增的URL
    const allNewUrls = [];

    for (const url of feeds) {
      try {
        console.log(`🔍 正在检查订阅源: ${url}`);

        const result = await rssManager.addFeed(url);

        if (result.success) {
          // 获取 sitemap 内容用于发送
          let sitemapContent = null;
          if (result.datedFile) {
            const domain = new URL(url).hostname;
            sitemapContent = await rssManager.getSitemapContent(domain, 'dated');
          }

          // 只有在有新URL时才发送更新通知
          if (result.newUrls && result.newUrls.length > 0) {
            await notificationManager.sendUpdateNotification(url, result.newUrls, sitemapContent);
            console.log(`✨ 订阅源 ${url} 更新成功，发现 ${result.newUrls.length} 个新URL`);
            allNewUrls.push(...result.newUrls);
          } else {
            console.log(`✅ 订阅源 ${url} 更新成功，无新增URL（静默模式）`);
          }
        } else {
          console.warn(`⚠️ 订阅源 ${url} 更新失败: ${result.errorMsg}`);
        }

        // 添加延迟避免频率限制
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ 检查订阅源失败: ${url}`, error);
      }
    }

    // 发送关键词汇总
    if (allNewUrls.length > 0) {
      console.log(`📊 发送关键词汇总，共 ${allNewUrls.length} 个新URL`);
      await notificationManager.sendKeywordsSummary(allNewUrls);
    }

    console.log('✅ 定时监控任务完成');

  } catch (error) {
    console.error('❌ 定时监控任务失败:', error);
  }
}

/**
 * 处理 HTTP 请求
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} ctx - 上下文对象
 * @returns {Response} 响应对象
 */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // 健康检查
    if (path === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'site-bot',
        version: '1.0.0'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 手动触发监控
    if (path === '/monitor' && request.method === 'POST') {
      ctx.waitUntil(performScheduledMonitoring(env));
      return new Response(JSON.stringify({
        status: 'success',
        message: '监控任务已启动',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Telegram Webhook
    if (path === '/webhook/telegram' && request.method === 'POST') {
      const update = await request.json();
      const result = await notificationManager.handleTelegramUpdate(update, rssManager);

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Discord Webhook
    if (path === '/webhook/discord' && request.method === 'POST') {
      const interaction = await request.json();
      const result = await handleDiscordInteraction(interaction, rssManager);

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // API 状态
    if (path === '/api/status') {
      const feeds = rssManager ? await rssManager.getFeeds() : [];
      const googleDomains = googleSearchMonitor ? await googleSearchMonitor.getMonitoredDomains() : [];
      const googleStatus = googleSearchMonitor ? await googleSearchMonitor.getMonitoringStatus() : { enabled: false };
      const channelStatus = notificationManager.getChannelStatus();
      
      return new Response(JSON.stringify({
        status: 'running',
        feeds: feeds,  // 保持原有字段名，确保n8n兼容性
        google_search_domains: googleDomains,  // 新增字段
        google_search_status: googleStatus,    // 新增字段
        notification_channels: channelStatus,
        enabled_channels: notificationManager.enabledChannels,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 添加 sitemap 监控
    if (path === '/api/feeds/add' && request.method === 'POST') {
      const { url } = await request.json();
      
      if (!url) {
        return new Response(JSON.stringify({
          status: 'error',
          message: '缺少 URL 参数'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const result = await rssManager.addFeed(url);
      
      return new Response(JSON.stringify({
        status: result.success ? 'success' : 'error',
        message: result.success ? '添加成功' : result.errorMsg,
        result: result,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 删除 sitemap 监控
    if (path === '/api/feeds/remove' && request.method === 'POST') {
      const { url } = await request.json();
      
      if (!url) {
        return new Response(JSON.stringify({
          status: 'error',
          message: '缺少 URL 参数'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const result = await rssManager.removeFeed(url);
      
      return new Response(JSON.stringify({
        status: result.success ? 'success' : 'error',
        message: result.success ? '删除成功' : result.errorMsg,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 测试通知
    if (path === '/test/notification' && request.method === 'POST') {
      const result = await notificationManager.sendTestMessage();
      return new Response(JSON.stringify({
        status: 'success',
        message: '测试消息已发送',
        result: result,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 简单文本测试
    if (path === '/test/simple' && request.method === 'POST') {
      const { sendTextMessage } = await import('./apps/feishu-sender.js');
      const result = await sendTextMessage('🔔 飞书简单文本测试消息\n\n时间: ' + new Date().toLocaleString('zh-CN') + '\n状态: 正常');
      
      return new Response(JSON.stringify({
        status: result.success ? 'success' : 'error',
        message: result.success ? '简单文本消息已发送' : '发送失败',
        result: result,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google搜索监控 - 添加域名(支持单个或批量)
    if (path === '/api/google-search/add' && request.method === 'POST') {
      const { domain, domains } = await request.json();
      
      // 支持单个域名或域名数组
      let domainsToAdd = [];
      if (domain) {
        domainsToAdd = [domain];
      } else if (domains && Array.isArray(domains)) {
        domainsToAdd = domains;
      } else {
        return new Response(JSON.stringify({
          status: 'error',
          message: '缺少 domain 参数或 domains 数组'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 批量处理，每个域名之间添加延迟
      const results = [];
      for (let i = 0; i < domainsToAdd.length; i++) {
        const currentDomain = domainsToAdd[i];
        try {
          const result = await googleSearchMonitor.addDomain(currentDomain);
          results.push({
            domain: currentDomain,
            success: result.success,
            message: result.message
          });
          
          // 添加延迟避免并发冲突（除了最后一个）
          if (i < domainsToAdd.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error) {
          results.push({
            domain: currentDomain,
            success: false,
            message: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      
      return new Response(JSON.stringify({
        status: successCount === totalCount ? 'success' : 'partial',
        message: `${successCount}/${totalCount} 个域名添加成功`,
        results: results,
        summary: {
          total: totalCount,
          success: successCount,
          failed: totalCount - successCount
        },
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google搜索监控 - 删除域名(支持单个或批量)
    if (path === '/api/google-search/remove' && request.method === 'POST') {
      const { domain, domains } = await request.json();
      
      // 支持单个域名或域名数组
      let domainsToRemove = [];
      if (domain) {
        domainsToRemove = [domain];
      } else if (domains && Array.isArray(domains)) {
        domainsToRemove = domains;
      } else {
        return new Response(JSON.stringify({
          status: 'error',
          message: '缺少 domain 参数或 domains 数组'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 批量处理，每个域名之间添加延迟
      const results = [];
      for (let i = 0; i < domainsToRemove.length; i++) {
        const currentDomain = domainsToRemove[i];
        try {
          const result = await googleSearchMonitor.removeDomain(currentDomain);
          results.push({
            domain: currentDomain,
            success: result.success,
            message: result.message
          });
          
          // 添加延迟避免并发冲突（除了最后一个）
          if (i < domainsToRemove.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error) {
          results.push({
            domain: currentDomain,
            success: false,
            message: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      
      return new Response(JSON.stringify({
        status: successCount === totalCount ? 'success' : 'partial',
        message: `${successCount}/${totalCount} 个域名删除成功`,
        results: results,
        summary: {
          total: totalCount,
          success: successCount,
          failed: totalCount - successCount
        },
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google搜索监控 - 手动执行
    if (path === '/api/google-search/execute' && request.method === 'POST') {
      ctx.waitUntil(googleSearchMonitor.executeMonitoring());
      return new Response(JSON.stringify({
        status: 'success',
        message: 'Google搜索监控任务已启动',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google搜索监控 - 获取状态
    if (path === '/api/google-search/status' && request.method === 'GET') {
      const status = await googleSearchMonitor.getMonitoringStatus();
      return new Response(JSON.stringify(status), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 默认响应
    return new Response(JSON.stringify({
      message: 'Site Bot API',
      endpoints: [
        '/health - 健康检查',
        '/monitor - 手动触发 sitemap 监控 (POST)',
        '/api/status - API 状态',
        '/api/feeds/add - 添加 sitemap 监控 (POST)',
        '/api/feeds/remove - 删除 sitemap 监控 (POST)',
        '/api/google-search/add - 添加 Google 搜索域名监控 (POST)',
        '/api/google-search/remove - 删除 Google 搜索域名监控 (POST)',
        '/api/google-search/execute - 手动执行 Google 搜索监控 (POST)',
        '/api/google-search/status - 获取 Google 搜索监控状态 (GET)',
        '/test/notification - 测试通知 (POST)',
        '/test/simple - 简单文本测试 (POST)',
        '/webhook/telegram - Telegram Webhook',
        '/webhook/discord - Discord Webhook'
      ],
      enabled_channels: notificationManager.enabledChannels,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('处理请求失败:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Cloudflare Workers 事件处理器
export default {
  // 处理 HTTP 请求
  async fetch(request, env, ctx) {
    // 确保应用已初始化
    if (!rssManager) {
      try {
        initializeApp(env);
      } catch (error) {
        return new Response(JSON.stringify({
          error: 'Initialization Failed',
          message: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return await handleRequest(request, env, ctx);
  },

  // 定时任务触发器（只执行sitemap监控）
  async scheduled(event, env, ctx) {
    console.log('⏰ 收到定时任务触发');

    // 确保应用已初始化
    if (!rssManager) {
      try {
        initializeApp(env);
      } catch (error) {
        console.error('❌ 初始化失败:', error);
        return;
      }
    }

    // 执行sitemap监控任务
    ctx.waitUntil(performScheduledMonitoring(env));
  }
};

// 临时添加空的 DO 类以进行迁移
export class DomainListDO {
	constructor(state, env) {}
	fetch(request) {
		return new Response('This DO is deprecated and being removed.', { status: 410 });
	}
} 