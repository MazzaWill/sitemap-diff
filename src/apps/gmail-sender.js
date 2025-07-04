/**
 * Gmail 邮件发送模块
 * 使用 Gmail API 发送邮件通知
 */

import { gmailConfig } from '../config.js';

/**
 * 发送邮件
 * @param {string} to - 收件人邮箱
 * @param {string} subject - 邮件主题
 * @param {string} htmlContent - HTML 内容
 * @param {string} textContent - 纯文本内容
 * @param {Array} attachments - 附件数组
 * @returns {Promise<Object>} 发送结果
 */
export async function sendEmail(to, subject, htmlContent, textContent = '', attachments = []) {
  try {
    // 使用 SMTP.js 或类似的库来发送邮件
    // 由于 Cloudflare Workers 的限制，我们使用第三方邮件服务
    // 这里实现一个简化的邮件发送逻辑
    
    const emailData = {
      to: to || gmailConfig.to,
      subject: subject,
      html: htmlContent,
      text: textContent,
      attachments: attachments
    };

    // 使用 Gmail SMTP 通过第三方服务发送
    // 注意：在 Cloudflare Workers 中，我们需要使用 HTTP API 而不是 SMTP
    const result = await sendViaGmailAPI(emailData);
    
    if (result.success) {
      console.log(`邮件发送成功: ${subject} -> ${to}`);
      return { success: true, messageId: result.messageId };
    } else {
      console.error(`邮件发送失败: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('发送邮件时发生错误:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 通过 Gmail API 发送邮件
 * @param {Object} emailData - 邮件数据
 * @returns {Promise<Object>} 发送结果
 */
async function sendViaGmailAPI(emailData) {
  try {
    // 构建 RFC 2822 格式的邮件内容
    const boundary = `----boundary_${Date.now()}`;
    let rawEmail = [
      `From: ${gmailConfig.user}`,
      `To: ${emailData.to}`,
      `Subject: ${emailData.subject}`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      emailData.html,
      ''
    ].join('\r\n');

    // 添加附件
    if (emailData.attachments && emailData.attachments.length > 0) {
      for (const attachment of emailData.attachments) {
        rawEmail += [
          `--${boundary}`,
          `Content-Type: ${attachment.contentType || 'application/octet-stream'}`,
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
          'Content-Transfer-Encoding: base64',
          '',
          attachment.content, // 应该是 base64 编码的内容
          ''
        ].join('\r\n');
      }
    }

    rawEmail += `--${boundary}--`;

    // 将邮件内容编码为 base64
    const encodedEmail = btoa(rawEmail)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 注意：这里需要 OAuth 2.0 访问令牌
    // 在实际使用中，你需要配置 Gmail API 的 OAuth 2.0 认证
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gmailConfig.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: encodedEmail
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gmail API 错误: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return { success: true, messageId: result.id };

  } catch (error) {
    console.error('Gmail API 发送失败:', error);
    
    // 如果 Gmail API 失败，尝试使用 SMTP2GO 或类似服务作为备用
    return await sendViaBackupService(emailData);
  }
}

/**
 * 使用备用邮件服务发送
 * @param {Object} emailData - 邮件数据
 * @returns {Promise<Object>} 发送结果
 */
async function sendViaBackupService(emailData) {
  try {
    // 使用 SMTP2GO 或类似的 HTTP 邮件服务
    // 这里提供一个简化的实现，实际使用时需要配置相应的服务
    
    const formData = new FormData();
    formData.append('api_key', gmailConfig.appPassword); // 使用应用密码作为 API 密钥
    formData.append('to', emailData.to);
    formData.append('sender', gmailConfig.user);
    formData.append('subject', emailData.subject);
    formData.append('html_body', emailData.html);
    formData.append('text_body', emailData.text);

    // 添加附件
    if (emailData.attachments && emailData.attachments.length > 0) {
      for (const attachment of emailData.attachments) {
        formData.append('attachments', new Blob([attachment.content], { type: attachment.contentType }), attachment.filename);
      }
    }

    const response = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.data && result.data.succeeded > 0) {
      return { success: true, messageId: result.data.email_id };
    } else {
      return { success: false, error: result.data?.error || '未知错误' };
    }

  } catch (error) {
    console.error('备用邮件服务发送失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 发送站点更新通知邮件
 * @param {string} url - sitemap URL
 * @param {string[]} newUrls - 新增的 URL 列表
 * @param {string} sitemapContent - sitemap 内容
 * @returns {Promise<void>}
 */
export async function sendUpdateNotificationEmail(url, newUrls, sitemapContent) {
  if (!gmailConfig.enabled) {
    console.log('Gmail 通知未启用，跳过邮件发送');
    return;
  }

  const domain = new URL(url).hostname;
  
  // 静默模式：只有在有新URL时才发送通知
  if (!newUrls || newUrls.length === 0) {
    console.log(`静默模式：${domain} 无更新，跳过邮件通知`);
    return;
  }

  try {
    const subject = `✨ ${domain} 发现新内容 (${newUrls.length}条)`;
    
    // 构建 HTML 邮件内容
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
            ✨ ${domain} 站点更新通知
          </h2>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>发现新增内容：</strong> ${newUrls.length} 条</p>
            <p><strong>来源：</strong> <a href="${url}" style="color: #3498db;">${url}</a></p>
            <p><strong>时间：</strong> ${new Date().toLocaleString('zh-CN')}</p>
          </div>

          <h3 style="color: #2c3e50; margin-top: 30px;">新增 URL 列表：</h3>
          <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 5px; padding: 15px;">
            ${newUrls.map(url => `
              <div style="margin: 10px 0; padding: 10px; border-left: 3px solid #3498db; background-color: #f8f9fa;">
                <a href="${url}" style="color: #2c3e50; text-decoration: none; word-break: break-all;">${url}</a>
              </div>
            `).join('')}
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 12px;">
            <p>此邮件由 Site Bot 自动发送，监控您关注的站点更新。</p>
          </div>
        </body>
      </html>
    `;

    // 构建纯文本内容
    const textContent = `
${domain} 站点更新通知

发现新增内容：${newUrls.length} 条
来源：${url}
时间：${new Date().toLocaleString('zh-CN')}

新增 URL 列表：
${newUrls.map(url => `- ${url}`).join('\n')}

此邮件由 Site Bot 自动发送，监控您关注的站点更新。
    `;

    // 准备附件
    const attachments = [];
    if (sitemapContent) {
      const filename = `${domain}_sitemap_${new Date().toISOString().split('T')[0]}.xml`;
      attachments.push({
        filename: filename,
        content: btoa(sitemapContent), // base64 编码
        contentType: 'application/xml'
      });
    }

    const result = await sendEmail(
      gmailConfig.to,
      subject,
      htmlContent,
      textContent,
      attachments
    );

    if (result.success) {
      console.log(`✅ 站点更新邮件发送成功: ${domain}`);
    } else {
      console.error(`❌ 站点更新邮件发送失败: ${domain}`, result.error);
    }

  } catch (error) {
    console.error(`发送站点更新邮件失败 for ${url}:`, error);
  }
}

/**
 * 发送关键词汇总邮件
 * @param {string[]} allNewUrls - 所有新增的 URL 列表
 * @returns {Promise<void>}
 */
export async function sendKeywordsSummaryEmail(allNewUrls) {
  if (!gmailConfig.enabled) {
    console.log('Gmail 通知未启用，跳过关键词汇总邮件');
    return;
  }

  if (!allNewUrls || allNewUrls.length === 0) {
    console.log('没有新的 URL，跳过关键词汇总邮件');
    return;
  }

  try {
    // 提取关键词
    const keywords = extractKeywords(allNewUrls);
    const domains = [...new Set(allNewUrls.map(url => {
      try {
        return new URL(url).hostname;
      } catch {
        return 'unknown';
      }
    }))];

    const subject = `📊 站点监控日报 - ${new Date().toLocaleDateString('zh-CN')}`;
    
    // 构建 HTML 邮件内容
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50; border-bottom: 2px solid #e74c3c; padding-bottom: 10px;">
            📊 站点监控日报
          </h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #2c3e50; margin-top: 0;">今日统计</h3>
            <div style="display: flex; justify-content: space-between; flex-wrap: wrap;">
              <div style="text-align: center; margin: 10px;">
                <div style="font-size: 24px; font-weight: bold; color: #e74c3c;">${allNewUrls.length}</div>
                <div style="color: #6c757d;">新增内容</div>
              </div>
              <div style="text-align: center; margin: 10px;">
                <div style="font-size: 24px; font-weight: bold; color: #3498db;">${domains.length}</div>
                <div style="color: #6c757d;">监控站点</div>
              </div>
              <div style="text-align: center; margin: 10px;">
                <div style="font-size: 24px; font-weight: bold; color: #27ae60;">${keywords.length}</div>
                <div style="color: #6c757d;">关键词</div>
              </div>
            </div>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #2c3e50;">监控站点</h3>
            <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 5px; padding: 15px;">
              ${domains.map(domain => `
                <span style="display: inline-block; margin: 5px; padding: 5px 10px; background-color: #3498db; color: white; border-radius: 3px; font-size: 12px;">
                  ${domain}
                </span>
              `).join('')}
            </div>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #2c3e50;">主要关键词</h3>
            <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 5px; padding: 15px;">
              ${keywords.map(keyword => `
                <span style="display: inline-block; margin: 5px; padding: 5px 10px; background-color: #e74c3c; color: white; border-radius: 3px; font-size: 12px;">
                  ${keyword}
                </span>
              `).join('')}
            </div>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #2c3e50;">最新内容预览</h3>
            <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 5px; padding: 15px;">
              ${allNewUrls.slice(0, 10).map(url => `
                <div style="margin: 10px 0; padding: 10px; border-left: 3px solid #27ae60; background-color: #f8f9fa;">
                  <a href="${url}" style="color: #2c3e50; text-decoration: none; word-break: break-all;">${url}</a>
                </div>
              `).join('')}
              ${allNewUrls.length > 10 ? `
                <div style="margin: 10px 0; padding: 10px; text-align: center; color: #6c757d;">
                  ... 还有 ${allNewUrls.length - 10} 条内容
                </div>
              ` : ''}
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 12px;">
            <p>此邮件由 Site Bot 自动发送，汇总您关注的站点今日更新。</p>
            <p>生成时间：${new Date().toLocaleString('zh-CN')}</p>
          </div>
        </body>
      </html>
    `;

    // 构建纯文本内容
    const textContent = `
站点监控日报 - ${new Date().toLocaleDateString('zh-CN')}

今日统计：
- 新增内容：${allNewUrls.length} 条
- 监控站点：${domains.length} 个
- 关键词：${keywords.length} 个

监控站点：
${domains.map(domain => `- ${domain}`).join('\n')}

主要关键词：
${keywords.map(keyword => `- ${keyword}`).join('\n')}

最新内容预览：
${allNewUrls.slice(0, 10).map(url => `- ${url}`).join('\n')}
${allNewUrls.length > 10 ? `... 还有 ${allNewUrls.length - 10} 条内容` : ''}

此邮件由 Site Bot 自动发送，汇总您关注的站点今日更新。
生成时间：${new Date().toLocaleString('zh-CN')}
    `;

    const result = await sendEmail(
      gmailConfig.to,
      subject,
      htmlContent,
      textContent
    );

    if (result.success) {
      console.log('✅ 关键词汇总邮件发送成功');
    } else {
      console.error('❌ 关键词汇总邮件发送失败:', result.error);
    }

  } catch (error) {
    console.error('发送关键词汇总邮件失败:', error);
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