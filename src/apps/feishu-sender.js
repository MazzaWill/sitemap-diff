/**
 * 飞书消息发送模块
 * 使用飞书 Webhook 发送消息通知
 */

import { feishuConfig } from '../config.js';

/**
 * 发送飞书消息
 * @param {Object} message - 消息对象
 * @returns {Promise<Object>} 发送结果
 */
export async function sendFeishuMessage(message) {
  try {
    if (!feishuConfig.enabled || !feishuConfig.webhook) {
      console.log('飞书通知未启用，跳过消息发送');
      return { success: false, error: '飞书通知未启用' };
    }

    const response = await fetch(feishuConfig.webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    if (result.code === 0) {
      console.log('飞书消息发送成功');
      return { success: true, data: result };
    } else {
      console.error('飞书消息发送失败:', result);
      return { success: false, error: result.msg || '发送失败' };
    }

  } catch (error) {
    console.error('发送飞书消息时发生错误:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 发送文本消息
 * @param {string} text - 消息文本
 * @returns {Promise<Object>} 发送结果
 */
export async function sendTextMessage(text) {
  const message = {
    msg_type: 'text',
    content: {
      text: text
    }
  };

  return await sendFeishuMessage(message);
}

/**
 * 发送富文本消息
 * @param {Object} content - 富文本内容
 * @returns {Promise<Object>} 发送结果
 */
export async function sendRichTextMessage(content) {
  const message = {
    msg_type: 'post',
    content: {
      post: content
    }
  };

  return await sendFeishuMessage(message);
}

/**
 * 发送卡片消息
 * @param {Object} card - 卡片内容
 * @returns {Promise<Object>} 发送结果
 */
export async function sendCardMessage(card) {
  const message = {
    msg_type: 'interactive',
    card: card
  };

  return await sendFeishuMessage(message);
}

/**
 * 发送站点更新通知
 * @param {string} url - sitemap URL
 * @param {string[]} newUrls - 新增的 URL 列表
 * @param {string} sitemapContent - sitemap 内容
 * @returns {Promise<void>}
 */
export async function sendUpdateNotificationFeishu(url, newUrls, sitemapContent) {
  if (!feishuConfig.enabled) {
    console.log('飞书通知未启用，跳过消息发送');
    return;
  }

  const domain = new URL(url).hostname;
  
  // 静默模式：只有在有新URL时才发送通知
  if (!newUrls || newUrls.length === 0) {
    console.log(`静默模式：${domain} 无更新，跳过飞书通知`);
    return;
  }

  try {
    // 构建卡片消息
    const card = {
      config: {
        wide_screen_mode: true,
        enable_forward: true
      },
      header: {
        title: {
          content: `✨ ${domain} 发现新内容`,
          tag: 'plain_text'
        },
        template: 'blue'
      },
      elements: [
        {
          tag: 'div',
          text: {
            content: `**发现新增内容：** ${newUrls.length} 条\\n**来源：** ${url}\\n**时间：** ${new Date().toLocaleString('zh-CN')}`,
            tag: 'lark_md'
          }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            content: '**新增 URL 列表：**',
            tag: 'lark_md'
          }
        }
      ]
    };

    // 添加 URL 列表 (限制显示前10个)
    const urlsToShow = newUrls.slice(0, 10);
    for (const urlItem of urlsToShow) {
      card.elements.push({
        tag: 'div',
        text: {
          content: `• [${urlItem}](${urlItem})`,
          tag: 'lark_md'
        }
      });
    }

    // 如果有更多 URL，添加省略提示
    if (newUrls.length > 10) {
      card.elements.push({
        tag: 'div',
        text: {
          content: `... 还有 ${newUrls.length - 10} 条内容`,
          tag: 'lark_md'
        }
      });
    }

    // 添加操作按钮
    card.elements.push({
      tag: 'hr'
    });
    
    card.elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            content: '查看源站',
            tag: 'plain_text'
          },
          url: url,
          type: 'default'
        }
      ]
    });

    const result = await sendCardMessage(card);

    if (result.success) {
      console.log(`✅ 飞书站点更新通知发送成功: ${domain}`);
    } else {
      console.error(`❌ 飞书站点更新通知发送失败: ${domain}`, result.error);
    }

  } catch (error) {
    console.error(`发送飞书站点更新通知失败 for ${url}:`, error);
  }
}

/**
 * 发送关键词汇总消息
 * @param {string[]} allNewUrls - 所有新增的 URL 列表
 * @returns {Promise<void>}
 */
export async function sendKeywordsSummaryFeishu(allNewUrls) {
  if (!feishuConfig.enabled) {
    console.log('飞书通知未启用，跳过关键词汇总');
    return;
  }

  if (!allNewUrls || allNewUrls.length === 0) {
    console.log('没有新的 URL，跳过飞书关键词汇总');
    return;
  }

  try {
    // 提取关键词和统计信息
    const keywords = extractKeywords(allNewUrls);
    const domains = [...new Set(allNewUrls.map(url => {
      try {
        return new URL(url).hostname;
      } catch {
        return 'unknown';
      }
    }))];

    // 构建卡片消息
    const card = {
      config: {
        wide_screen_mode: true,
        enable_forward: true
      },
      header: {
        title: {
          content: `📊 站点监控日报 - ${new Date().toLocaleDateString('zh-CN')}`,
          tag: 'plain_text'
        },
        template: 'red'
      },
      elements: [
        {
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                content: `**新增内容**\\n${allNewUrls.length} 条`,
                tag: 'lark_md'
              }
            },
            {
              is_short: true,
              text: {
                content: `**监控站点**\\n${domains.length} 个`,
                tag: 'lark_md'
              }
            },
            {
              is_short: true,
              text: {
                content: `**关键词**\\n${keywords.length} 个`,
                tag: 'lark_md'
              }
            },
            {
              is_short: true,
              text: {
                content: `**更新时间**\\n${new Date().toLocaleString('zh-CN')}`,
                tag: 'lark_md'
              }
            }
          ]
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            content: '**监控站点**',
            tag: 'lark_md'
          }
        },
        {
          tag: 'div',
          text: {
            content: domains.map(domain => `• ${domain}`).join('\\n'),
            tag: 'lark_md'
          }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            content: '**主要关键词**',
            tag: 'lark_md'
          }
        },
        {
          tag: 'div',
          text: {
            content: keywords.map(keyword => `• ${keyword}`).join('\\n'),
            tag: 'lark_md'
          }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            content: '**最新内容预览**',
            tag: 'lark_md'
          }
        }
      ]
    };

    // 添加内容预览（最多显示5个）
    const urlsToShow = allNewUrls.slice(0, 5);
    for (const urlItem of urlsToShow) {
      card.elements.push({
        tag: 'div',
        text: {
          content: `• [${urlItem}](${urlItem})`,
          tag: 'lark_md'
        }
      });
    }

    // 如果有更多内容，添加省略提示
    if (allNewUrls.length > 5) {
      card.elements.push({
        tag: 'div',
        text: {
          content: `... 还有 ${allNewUrls.length - 5} 条内容`,
          tag: 'lark_md'
        }
      });
    }

    const result = await sendCardMessage(card);

    if (result.success) {
      console.log('✅ 飞书关键词汇总发送成功');
    } else {
      console.error('❌ 飞书关键词汇总发送失败:', result.error);
    }

  } catch (error) {
    console.error('发送飞书关键词汇总失败:', error);
  }
}

/**
 * 提取关键词（简化版本）
 * @param {string[]} urls - URL 列表
 * @returns {string[]} 关键词列表
 */
function extractKeywords(urls) {
  const keywords = new Set();

  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;

      // 简单的关键词提取逻辑
      const segments = path.split('/').filter(segment => segment.length > 2);
      for (const segment of segments) {
        if (segment.length > 3 && !segment.includes('-')) {
          keywords.add(segment);
        }
      }
    } catch (error) {
      // 忽略无效 URL
    }
  }

  return Array.from(keywords).slice(0, 10); // 最多返回10个关键词
}

/**
 * 发送系统状态消息
 * @param {string} status - 状态信息
 * @param {string} level - 级别 (info, warning, error)
 * @returns {Promise<void>}
 */
export async function sendSystemStatusFeishu(status, level = 'info') {
  if (!feishuConfig.enabled) {
    return;
  }

  const templates = {
    info: 'blue',
    warning: 'yellow',
    error: 'red'
  };

  const icons = {
    info: '💡',
    warning: '⚠️',
    error: '❌'
  };

  const card = {
    config: {
      wide_screen_mode: false,
      enable_forward: true
    },
    header: {
      title: {
        content: `${icons[level]} 系统状态`,
        tag: 'plain_text'
      },
      template: templates[level]
    },
    elements: [
      {
        tag: 'div',
        text: {
          content: status,
          tag: 'lark_md'
        }
      },
      {
        tag: 'div',
        text: {
          content: `时间：${new Date().toLocaleString('zh-CN')}`,
          tag: 'lark_md'
        }
      }
    ]
  };

  try {
    const result = await sendCardMessage(card);
    if (result.success) {
      console.log(`✅ 飞书系统状态消息发送成功: ${level}`);
    } else {
      console.error(`❌ 飞书系统状态消息发送失败: ${level}`, result.error);
    }
  } catch (error) {
    console.error('发送飞书系统状态消息失败:', error);
  }
}