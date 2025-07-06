# Google 搜索监控功能设置指南

## 🎯 功能概述

Google 搜索监控功能可以自动检测指定域名在过去24小时内被Google收录的新页面，并通过飞书、Telegram等渠道发送通知。

## 🔧 环境变量配置

### 必需的环境变量

```bash
# 设置 Serper.dev API 密钥（推荐）
wrangler secret put SERPER_API_KEY
# 输入你的 Serper.dev API Key

# 如果没有 Serper API，功能会使用备用方法（功能有限）
```

### 获取 Serper.dev API 密钥

1. 访问 [Serper.dev](https://serper.dev)
2. 注册账户（**免费2500次查询**，无需信用卡）
3. 在 Dashboard 中找到你的 API Key
4. 使用 `wrangler secret put SERPER_API_KEY` 设置

**价格对比**：
| 服务 | 免费额度 | 付费价格 | 性价比 |
|------|----------|----------|--------|
| **Serper.dev** | **2500次免费** | **$0.30/1000次** | **🏆 最佳** |
| SerpApi | 100次/月 | $15/1000次 | 较贵 |

**成本节省**: Serper.dev比SerpApi便宜**50倍**！

## 📋 API 接口

### 1. 添加域名监控

```bash
curl -X POST "https://your-worker.workers.dev/api/google-search/add" \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'
```

### 2. 删除域名监控

```bash
curl -X POST "https://your-worker.workers.dev/api/google-search/remove" \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'
```

### 3. 手动执行Google搜索监控

```bash
curl -X POST "https://your-worker.workers.dev/api/google-search/execute"
```

### 4. 查看监控状态

```bash
curl "https://your-worker.workers.dev/api/status"
```

响应示例：
```json
{
  "status": "running",
  "feeds": ["https://example.com/sitemap.xml"],
  "google_search_domains": ["example.com", "blog.example.com"],
  "google_search_status": {
    "enabled": true,
    "totalDomains": 2,
    "domains": [
      {
        "domain": "example.com",
        "lastCheck": "2025-01-06T10:30:00Z",
        "status": "active"
      }
    ]
  },
  "notification_channels": {...},
  "enabled_channels": [...]
}
```

## 🚀 使用步骤

### 1. 配置 Serper.dev API（推荐）

```bash
# 设置 API 密钥
wrangler secret put SERPER_API_KEY
# 输入你的 Serper.dev API 密钥
```

### 2. 添加要监控的域名

```javascript
// 浏览器控制台中执行
fetch('/api/google-search/add', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    domain: 'pollo.ai'  // 替换为你要监控的域名
  })
})
.then(res => res.json())
.then(data => console.log('添加结果:', data));
```

### 3. 手动测试监控

```javascript
// 立即执行一次Google搜索监控
fetch('/api/google-search/execute', {
  method: 'POST'
})
.then(res => res.json())
.then(data => {
  console.log('监控执行结果:', data);
  alert('Google搜索监控完成！检查通知渠道是否收到消息');
});
```

## 📊 监控逻辑

### 搜索参数
- **查询语句**: `site:example.com`
- **时间过滤**: 过去24小时 (`tbs=qdr:d`)
- **结果数量**: 最多100个URL

### 去重机制
- 系统会保存每次搜索结果
- 只有新出现的URL才会触发通知
- 避免重复通知相同内容

### 存储结构
- `google_search_domains`: 监控的域名列表
- `google_search_example_com`: example.com的搜索历史
- `google_search_last_check_example_com`: 最后检查时间

## 🔄 自动执行

Google搜索监控是**独立**的监控功能：

1. **Sitemap监控**: `/monitor` 接口和定时任务 (cron: "0 * * * *") 只执行sitemap监控
2. **Google搜索监控**: 需要单独调用 `/api/google-search/execute` 执行
3. **独立通知**: 两种监控分别发送各自的通知

**注意**: 如果需要在n8n中同时执行两种监控，需要添加两个HTTP节点：
- 节点1: `POST /monitor` (sitemap监控)
- 节点2: `POST /api/google-search/execute` (Google搜索监控)

## 📱 通知格式

当发现新的Google收录页面时，系统会发送如下格式的通知：

```
🔍 **Google 搜索监控更新**

**域名**: pollo.ai
**新收录页面**: 3 个
**检查时间**: 2025-01-06 18:30:00

**新收录的页面**:
1. [AI Kitty Plane Video Generator](https://pollo.ai/ai-kitty-plane)
   Just upload an image of any cat and it can create a video of it becoming a cute, fluffy plane...

2. [40+ AI-effecten voor video's - Gratis AI-videosjablonen](https://pollo.ai/video-effects)
   Ontdek meer dan 40 gratis AI-video-effecten en -sjablonen met Pollo AI...

3. [probeer de naadloze textuurgenerator gratis](https://pollo.ai/ai-image-generator/texture)
   Onze naadloze textuurgenerator creërt textuurafbeeldingen die geoptimaliseerd zijn voor 3D-modellering...
```

## ⚠️ 注意事项

### 成本控制
- 每次搜索消耗1次API调用
- **免费额度充足**：2500次查询，可监控多个域名长期使用
- 即使付费也只需 $0.30/1000次，非常经济

### API限制
- Serper.dev 响应速度快（1-2秒）
- 系统已内置2秒延迟机制
- 避免频繁手动执行

### 备用方案
如果没有配置Serper API：
- 功能仍然可用，但无法获取实际搜索结果
- 强烈建议配置Serper.dev API以获得完整功能（免费额度充足）

## 🧪 测试验证

### 1. 验证配置
```bash
curl "https://your-worker.workers.dev/api/status"
```

### 2. 测试添加域名
```bash
curl -X POST "https://your-worker.workers.dev/api/google-search/add" \
  -H "Content-Type: application/json" \
  -d '{"domain": "test-domain.com"}'
```

### 3. 手动执行监控
```bash
curl -X POST "https://your-worker.workers.dev/api/google-search/execute"
```

### 4. 检查日志
```bash
wrangler tail
```

## 🔍 故障排除

### 常见问题

1. **"Serper API key not configured"**
   - 解决：使用 `wrangler secret put SERPER_API_KEY` 设置密钥

2. **"Invalid domain format"**
   - 解决：确保域名格式正确，如 `example.com`（不包括 `https://`）

3. **"Serper API request failed"**
   - 检查API密钥是否正确
   - 检查账户余额是否充足（Serper.dev有2500次免费额度）
   - 确认网络连接正常

4. **没有收到通知**
   - 检查通知渠道配置
   - 确认域名确实有新内容被Google收录
   - 查看Workers日志确认执行状态

### 调试步骤

1. **检查配置状态**
```bash
curl "https://your-worker.workers.dev/api/status"
```

2. **查看实时日志**
```bash
wrangler tail
```

3. **测试通知渠道**
```bash
curl -X POST "https://your-worker.workers.dev/test/notification"
```

## 🚀 部署后验证

1. 添加一个测试域名
2. 手动执行一次监控
3. 检查是否收到通知
4. 查看监控状态确认配置正确

现在你的Google搜索监控功能已经配置完成！系统将自动监控指定域名的Google收录情况，并在发现新内容时发送通知。