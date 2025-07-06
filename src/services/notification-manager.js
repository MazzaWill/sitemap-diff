/**
 * 统一通知管理器
 * 整合所有通知渠道，提供统一的消息发送接口
 */

import { telegramConfig, discordConfig, gmailConfig, feishuConfig } from '../config.js';

// 导入各种通知发送器
import { 
  sendUpdateNotification as sendTelegramUpdate,
  sendKeywordsSummary as sendTelegramSummary,
  handleTelegramUpdate
} from '../apps/telegram-bot.js';

import { 
  sendUpdateNotificationEmail,
  sendKeywordsSummaryEmail
} from '../apps/gmail-sender.js';

import {
  sendUpdateNotificationFeishu,
  sendKeywordsSummaryFeishu,
  sendSystemStatusFeishu
} from '../apps/feishu-sender.js';

export class NotificationManager {
  constructor() {
    this.enabledChannels = this.getEnabledChannels();
    console.log('通知管理器初始化完成，已启用的通知渠道:', this.enabledChannels);
  }

  /**
   * 获取已启用的通知渠道
   * @returns {string[]} 已启用的通知渠道列表
   */
  getEnabledChannels() {
    const channels = [];
    
    if (telegramConfig.enabled) {
      channels.push('telegram');
    }
    
    if (discordConfig.enabled) {
      channels.push('discord');
    }
    
    if (gmailConfig.enabled) {
      channels.push('gmail');
    }
    
    if (feishuConfig.enabled) {
      channels.push('feishu');
    }
    
    return channels;
  }

  /**
   * 发送站点更新通知到所有启用的渠道
   * @param {string} url - sitemap URL
   * @param {string[]} newUrls - 新增的 URL 列表
   * @param {string} sitemapContent - sitemap 内容
   * @returns {Promise<Object>} 发送结果统计
   */
  async sendUpdateNotification(url, newUrls, sitemapContent) {
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      channels: {}
    };

    // 静默模式：只有在有新URL时才发送通知
    if (!newUrls || newUrls.length === 0) {
      const domain = new URL(url).hostname;
      console.log(`静默模式：${domain} 无更新，跳过所有通知`);
      return results;
    }

    console.log(`开始发送站点更新通知: ${url}, 新增 ${newUrls.length} 条内容`);

    // 并行发送到所有启用的渠道
    const promises = [];

    if (telegramConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'telegram',
          () => sendTelegramUpdate(url, newUrls, sitemapContent),
          results
        )
      );
    }

    if (gmailConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'gmail',
          () => sendUpdateNotificationEmail(url, newUrls, sitemapContent),
          results
        )
      );
    }

    if (feishuConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'feishu',
          () => sendUpdateNotificationFeishu(url, newUrls, sitemapContent),
          results
        )
      );
    }

    // 等待所有发送完成
    await Promise.all(promises);

    console.log(`站点更新通知发送完成: ${results.success}/${results.total} 成功`);
    return results;
  }

  /**
   * 发送Google搜索监控通知
   * @param {string} message - 格式化的通知消息
   * @param {string} level - 消息级别 (info, warning, error)
   * @returns {Promise<Object>} 发送结果统计
   */
  async sendNotification(message, level = 'info') {
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      channels: {}
    };

    console.log(`发送Google搜索监控通知: ${level}`);

    // 并行发送到所有启用的渠道
    const promises = [];

    if (feishuConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'feishu',
          () => sendSystemStatusFeishu(message, level),
          results
        )
      );
    }

    if (telegramConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'telegram',
          () => this.sendTelegramGoogleSearchUpdate(message),
          results
        )
      );
    }

    if (gmailConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'gmail',
          () => this.sendGmailGoogleSearchUpdate(message),
          results
        )
      );
    }

    // 等待所有发送完成
    await Promise.all(promises);

    console.log(`Google搜索监控通知发送完成: ${results.success}/${results.total} 成功`);
    return results;
  }

  /**
   * 发送关键词汇总到所有启用的渠道
   * @param {string[]} allNewUrls - 所有新增的 URL 列表
   * @returns {Promise<Object>} 发送结果统计
   */
  async sendKeywordsSummary(allNewUrls) {
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      channels: {}
    };

    if (!allNewUrls || allNewUrls.length === 0) {
      console.log('没有新的 URL，跳过关键词汇总通知');
      return results;
    }

    console.log(`开始发送关键词汇总: 共 ${allNewUrls.length} 条新内容`);

    // 并行发送到所有启用的渠道
    const promises = [];

    if (telegramConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'telegram',
          () => sendTelegramSummary(allNewUrls),
          results
        )
      );
    }

    if (gmailConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'gmail',
          () => sendKeywordsSummaryEmail(allNewUrls),
          results
        )
      );
    }

    if (feishuConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'feishu',
          () => sendKeywordsSummaryFeishu(allNewUrls),
          results
        )
      );
    }

    // 等待所有发送完成
    await Promise.all(promises);

    console.log(`关键词汇总发送完成: ${results.success}/${results.total} 成功`);
    return results;
  }

  /**
   * 发送系统状态消息
   * @param {string} message - 状态消息
   * @param {string} level - 级别 (info, warning, error)
   * @returns {Promise<Object>} 发送结果统计
   */
  async sendSystemStatus(message, level = 'info') {
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      channels: {}
    };

    console.log(`发送系统状态消息: ${level} - ${message}`);

    // 系统状态消息只发送到部分渠道
    const promises = [];

    // 飞书适合发送系统状态消息
    if (feishuConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'feishu',
          () => sendSystemStatusFeishu(message, level),
          results
        )
      );
    }

    // Telegram 也可以发送系统状态（作为普通文本消息）
    if (telegramConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'telegram',
          () => this.sendTelegramSystemStatus(message, level),
          results
        )
      );
    }

    // 等待所有发送完成
    await Promise.all(promises);

    console.log(`系统状态消息发送完成: ${results.success}/${results.total} 成功`);
    return results;
  }

  /**
   * 发送测试消息到所有启用的渠道
   * @returns {Promise<Object>} 发送结果统计
   */
  async sendTestMessage() {
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      channels: {}
    };

    const testMessage = `🔔 Site Bot 测试消息\\n\\n时间: ${new Date().toLocaleString('zh-CN')}\\n状态: 正常运行\\n\\n这是一条测试消息，用于验证通知渠道是否正常工作。`;

    console.log('发送测试消息到所有启用的渠道');

    const promises = [];

    if (feishuConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'feishu',
          () => sendSystemStatusFeishu(testMessage, 'info'),
          results
        )
      );
    }

    if (telegramConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'telegram',
          () => this.sendTelegramSystemStatus(testMessage, 'info'),
          results
        )
      );
    }

    // Gmail 测试消息
    if (gmailConfig.enabled) {
      promises.push(
        this.sendWithErrorHandling(
          'gmail',
          () => this.sendGmailTestMessage(),
          results
        )
      );
    }

    await Promise.all(promises);

    console.log(`测试消息发送完成: ${results.success}/${results.total} 成功`);
    return results;
  }

  /**
   * 处理 Telegram 更新（兼容性方法）
   * @param {Object} update - Telegram 更新对象
   * @param {RSSManager} rssManager - RSS 管理器实例
   * @returns {Promise<Object>} 处理结果
   */
  async handleTelegramUpdate(update, rssManager) {
    if (!telegramConfig.enabled) {
      return { success: false, error: 'Telegram 未启用' };
    }

    return await handleTelegramUpdate(update, rssManager);
  }

  /**
   * 带错误处理的发送方法
   * @param {string} channel - 通知渠道名称
   * @param {Function} sendFunction - 发送函数
   * @param {Object} results - 结果统计对象
   * @returns {Promise<void>}
   */
  async sendWithErrorHandling(channel, sendFunction, results) {
    results.total++;
    results.channels[channel] = { success: false, error: null };

    try {
      await sendFunction();
      results.success++;
      results.channels[channel].success = true;
      console.log(`✅ ${channel} 通知发送成功`);
    } catch (error) {
      results.failed++;
      results.channels[channel].error = error.message;
      console.error(`❌ ${channel} 通知发送失败:`, error);
    }
  }

  /**
   * 发送 Telegram 系统状态消息
   * @param {string} message - 消息内容
   * @param {string} level - 级别
   * @returns {Promise<void>}
   */
  async sendTelegramSystemStatus(message, level) {
    const { sendMessage } = await import('../apps/telegram-bot.js');
    
    const icons = {
      info: '💡',
      warning: '⚠️',
      error: '❌'
    };

    const formattedMessage = `${icons[level]} <b>系统状态</b>\\n\\n${message}`;
    await sendMessage(telegramConfig.targetChat, formattedMessage);
  }

  /**
   * 发送 Gmail 测试消息
   * @returns {Promise<void>}
   */
  async sendGmailTestMessage() {
    const { sendEmail } = await import('../apps/gmail-sender.js');
    
    const subject = '🔔 Site Bot 测试消息';
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50;">🔔 Site Bot 测试消息</h2>
          <p>时间: ${new Date().toLocaleString('zh-CN')}</p>
          <p>状态: 正常运行</p>
          <p>这是一条测试消息，用于验证邮件通知渠道是否正常工作。</p>
        </body>
      </html>
    `;
    
    const textContent = `Site Bot 测试消息\\n\\n时间: ${new Date().toLocaleString('zh-CN')}\\n状态: 正常运行\\n\\n这是一条测试消息，用于验证邮件通知渠道是否正常工作。`;
    
    await sendEmail(gmailConfig.to, subject, htmlContent, textContent);
  }

  /**
   * 发送 Telegram Google搜索更新消息
   * @param {string} message - 消息内容
   * @returns {Promise<void>}
   */
  async sendTelegramGoogleSearchUpdate(message) {
    const { sendMessage } = await import('../apps/telegram-bot.js');
    
    const formattedMessage = message.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    await sendMessage(telegramConfig.targetChat, formattedMessage);
  }

  /**
   * 发送 Gmail Google搜索更新消息
   * @param {string} message - 消息内容
   * @returns {Promise<void>}
   */
  async sendGmailGoogleSearchUpdate(message) {
    const { sendEmail } = await import('../apps/gmail-sender.js');
    
    const subject = '🔍 Google搜索监控更新';
    
    // 将Markdown格式转换为HTML
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50;">🔍 Google搜索监控更新</h2>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
            ${message
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\n/g, '<br>')
              .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>')
            }
          </div>
        </body>
      </html>
    `;
    
    const textContent = message
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '$1 ($2)');
    
    await sendEmail(gmailConfig.to, subject, htmlContent, textContent);
  }

  /**
   * 获取通知渠道状态
   * @returns {Object} 各渠道的状态信息
   */
  getChannelStatus() {
    return {
      telegram: {
        enabled: telegramConfig.enabled,
        configured: !!(telegramConfig.token && telegramConfig.targetChat)
      },
      discord: {
        enabled: discordConfig.enabled,
        configured: !!discordConfig.token
      },
      gmail: {
        enabled: gmailConfig.enabled,
        configured: !!(gmailConfig.user && gmailConfig.appPassword && gmailConfig.to)
      },
      feishu: {
        enabled: feishuConfig.enabled,
        configured: !!feishuConfig.webhook
      }
    };
  }
}

// 创建全局实例
export const notificationManager = new NotificationManager();