/**
 * 配置管理模块
 * 对应原 Python 项目的 core/config.py
 */

export const telegramConfig = {
  token: null, // 从环境变量获取
  targetChat: null, // 从环境变量获取
  enabled: false, // 是否启用 Telegram 通知
};

export const discordConfig = {
  token: null, // 从环境变量获取
  enabled: false, // 是否启用 Discord 通知
};

export const gmailConfig = {
  user: null, // Gmail 用户名
  appPassword: null, // Gmail 应用密码
  to: null, // 收件人邮箱
  enabled: false, // 是否启用 Gmail 通知
};

export const feishuConfig = {
  webhook: null, // 飞书 Webhook URL
  secret: null, // 飞书签名密钥（可选）
  enabled: false, // 是否启用飞书通知
};

/**
 * 初始化配置
 * @param {Object} env - Cloudflare Workers 环境变量
 */
export function initConfig(env) {
  // Telegram 配置
  telegramConfig.token = env.TELEGRAM_BOT_TOKEN || "";
  telegramConfig.targetChat = env.TELEGRAM_TARGET_CHAT || "";
  telegramConfig.enabled = !!(telegramConfig.token && telegramConfig.targetChat);

  // Discord 配置
  discordConfig.token = env.DISCORD_TOKEN || "";
  discordConfig.enabled = !!discordConfig.token;

  // Gmail 配置
  gmailConfig.user = env.GMAIL_USER || "";
  gmailConfig.appPassword = env.GMAIL_APP_PASSWORD || "";
  gmailConfig.to = env.GMAIL_TO || "";
  gmailConfig.enabled = !!(gmailConfig.user && gmailConfig.appPassword && gmailConfig.to);

  // 飞书配置
  feishuConfig.webhook = env.FEISHU_WEBHOOK || "";
  feishuConfig.secret = env.FEISHU_SECRET || "";
  feishuConfig.enabled = !!feishuConfig.webhook;

  console.log("配置初始化完成");
  console.log("Telegram:", telegramConfig.enabled ? "已启用" : "未启用");
  console.log("Discord:", discordConfig.enabled ? "已启用" : "未启用");
  console.log("Gmail:", gmailConfig.enabled ? "已启用" : "未启用");
  console.log("飞书:", feishuConfig.enabled ? "已启用" : "未启用");
}

/**
 * 验证配置是否完整
 * @returns {Object} 验证结果
 */
export function validateConfig() {
  const errors = [];
  const enabledChannels = [];

  // 检查每个通知渠道的配置
  if (telegramConfig.enabled) {
    enabledChannels.push("Telegram");
  } else if (telegramConfig.token && !telegramConfig.targetChat) {
    errors.push("TELEGRAM_BOT_TOKEN 已设置但 TELEGRAM_TARGET_CHAT 未设置");
  } else if (!telegramConfig.token && telegramConfig.targetChat) {
    errors.push("TELEGRAM_TARGET_CHAT 已设置但 TELEGRAM_BOT_TOKEN 未设置");
  }

  if (discordConfig.enabled) {
    enabledChannels.push("Discord");
  }

  if (gmailConfig.enabled) {
    enabledChannels.push("Gmail");
  } else if (gmailConfig.user || gmailConfig.appPassword || gmailConfig.to) {
    if (!gmailConfig.user) errors.push("GMAIL_USER 未设置");
    if (!gmailConfig.appPassword) errors.push("GMAIL_APP_PASSWORD 未设置");
    if (!gmailConfig.to) errors.push("GMAIL_TO 未设置");
  }

  if (feishuConfig.enabled) {
    enabledChannels.push("飞书");
  }

  // 至少需要一个通知渠道
  if (enabledChannels.length === 0) {
    errors.push("至少需要配置一个通知渠道 (Telegram, Discord, Gmail, 或飞书)");
  }

  return {
    isValid: errors.length === 0,
    errors,
    enabledChannels
  };
} 