# 🚀 Sitemap监控 - n8n快速部署指南

## 📋 总览

只需要**一个工作流**即可完成所有功能：
- ✅ 智能同步Google Sheets配置到Worker
- ✅ 定时执行监控任务
- ✅ 自动记录监控日志
- ✅ 保持现有飞书通知功能

## ⏱️ 30分钟完成部署

### 步骤1: 创建Google Sheets（10分钟）

#### 1.1 创建表格
1. 访问 https://sheets.google.com
2. 创建新表格，命名为"Sitemap监控数据"
3. 创建2个工作表：
   - `sitemap-config`（网站配置）
   - `monitoring-logs`（监控日志）

#### 1.2 导入示例数据

**在sitemap-config表中粘贴**：
```csv
website_name,sitemap_url,status,last_check,created_at,notes
Cloudflare博客,https://blog.cloudflare.com/sitemap.xml,active,,2025-07-04 09:00:00,重要技术博客
OpenAI博客,https://openai.com/sitemap.xml,active,,2025-07-04 09:00:00,AI资讯
Vercel博客,https://vercel.com/sitemap.xml,inactive,,2025-07-04 09:00:00,暂停监控
```

**在monitoring-logs表中粘贴**：
```csv
timestamp,sync_action,monitoring_status,worker_message,success
2025-07-04 10:00:00,skip,completed,Monitoring completed successfully,TRUE
```

#### 1.3 获取表格ID
从URL中提取ID：`https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit`

### 步骤2: 配置n8n（10分钟）

#### 2.1 登录并配置凭证
1. 访问 https://n8n.zhelogic.com/
2. 点击右上角头像 → Settings → Credentials
3. Create New → Google Sheets OAuth2 API
4. 完成OAuth2授权

#### 2.2 导入工作流
1. 点击"Import from File"
2. 选择 `sitemap-monitoring-workflow.json`
3. 点击"Import"

### 步骤3: 修改配置（5分钟）

#### 3.1 更新Google Sheets ID
在工作流中找到所有的：
```json
"documentId": "YOUR_GOOGLE_SHEET_ID"
```
替换为：
```json
"documentId": "你的实际Sheet ID"
```

#### 3.2 更新Worker域名
在工作流中找到所有的：
```json
"url": "https://YOUR_WORKER_DOMAIN.workers.dev"
```
替换为：
```json
"url": "https://你的Worker域名.workers.dev"
```

### 步骤4: 测试运行（5分钟）

#### 4.1 手动测试
1. 在n8n中点击"Test workflow"
2. 观察每个节点的执行状态
3. 检查是否有错误信息

#### 4.2 验证结果
- ✅ Google Sheets的`last_check`时间已更新
- ✅ `monitoring-logs`表中有新的记录
- ✅ 飞书收到监控完成通知

## 📊 数据表结构说明

### sitemap-config表（网站配置）
| 列名 | 用途 | 格式 | 示例 |
|------|------|------|------|
| website_name | 网站标识名称 | 文本 | "技术博客" |
| sitemap_url | 完整的sitemap URL | URL | "https://blog.com/sitemap.xml" |
| status | 监控状态 | active/inactive | "active" |
| last_check | 最后检查时间 | YYYY-MM-DD HH:mm:ss | "2025-07-04 10:00:00" |
| created_at | 添加时间 | YYYY-MM-DD HH:mm:ss | "2025-07-04 09:00:00" |
| notes | 备注信息 | 文本 | "重要客户网站" |

### monitoring-logs表（监控日志）
| 列名 | 用途 | 格式 | 示例 |
|------|------|------|------|
| timestamp | 执行时间 | YYYY-MM-DD HH:mm:ss | "2025-07-04 10:00:00" |
| sync_action | 同步操作记录 | 文本 | "add:2 remove:1" 或 "skip" |
| monitoring_status | 监控结果状态 | completed/failed | "completed" |
| worker_message | Worker返回消息 | 文本 | "Monitoring completed successfully" |
| success | 是否成功 | TRUE/FALSE | TRUE |

## 🔄 工作流执行逻辑

### 每2小时自动执行的完整流程：

```
⏰ 定时触发
    ↓
📊 读取Google Sheets配置
    ↓
🔍 获取Worker当前监控列表
    ↓
🧠 智能对比分析差异
    ├─ 有新增网站 → 📝 调用API添加到Worker
    ├─ 有删除网站 → 🗑️ 调用API从Worker移除
    └─ 无差异 → ⏭️ 跳过同步
    ↓
🚀 调用Worker执行监控
    ↓
📝 记录监控日志到Sheets
    ↓
🔄 更新所有网站的last_check时间
    ↓
📲 发送监控完成通知
```

### 智能同步说明：
- **新增**: Sheet中status=active但Worker中没有的网站
- **删除**: Worker中有但Sheet中status=inactive或已删除的网站
- **跳过**: 配置完全一致时直接执行监控

## 📈 日常使用

### 🆕 添加新网站监控
1. 在`sitemap-config`表中添加新行
2. 填写必要信息，status设为"active"
3. 等待下次工作流执行（最多2小时）

### ⏸️ 暂停网站监控
1. 将`sitemap-config`表中对应网站的status改为"inactive"
2. 下次执行时自动从Worker中移除

### 📊 查看监控状态
- **实时状态**: 查看`sitemap-config`表的`last_check`时间
- **执行历史**: 查看`monitoring-logs`表的详细记录
- **n8n日志**: 在n8n界面查看工作流执行历史

## ⚙️ 自定义配置

### 修改监控频率
编辑工作流中的Cron表达式：
```json
"value": "0 */2 * * *"    // 每2小时
"value": "0 */4 * * *"    // 每4小时  
"value": "0 9,15,21 * * *" // 每天9点、15点、21点
```

### 修改通知消息
在"发送完成通知"节点中自定义消息内容：
```json
"message": "🎯 监控完成\\n执行时间: {{ $json.timestamp }}\\n监控状态: {{ $json.worker_status }}"
```

## 🔧 故障排除

### 常见错误及解决方案

❌ **"Access denied to Google Sheets"**
```
解决: 重新配置Google Sheets OAuth2凭证
1. 删除现有凭证
2. 重新创建并授权
3. 更新工作流中的凭证引用
```

❌ **"Worker API call failed"**
```
解决: 检查Worker配置
1. 确认Worker域名正确
2. 测试Worker API是否响应
3. 检查Worker服务是否正常运行
```

❌ **"Invalid date format"**
```
解决: 检查时间格式
确保所有时间字段格式为: YYYY-MM-DD HH:mm:ss
```

❌ **"Workflow execution timeout"**
```
解决: 优化执行超时设置
1. 增加超时时间到3600秒
2. 检查是否有网络延迟
3. 减少一次性处理的网站数量
```

### 调试技巧

1. **逐步测试**
   - 使用n8n的"Test Step"功能
   - 检查每个节点的输入输出数据

2. **查看详细日志**
   - 在n8n执行历史中查看完整日志
   - 检查Worker的console日志

3. **数据验证**
   - 确认Google Sheets数据格式正确
   - 验证API返回的JSON格式

## ✅ 部署完成检查清单

部署完成后，请确认以下功能正常：

- [ ] Google Sheets可以正常读写
- [ ] 工作流可以成功执行
- [ ] 配置同步功能正常（添加/删除网站）
- [ ] Worker监控任务正常执行
- [ ] 飞书通知正常发送
- [ ] 监控日志正确保存
- [ ] 检查时间正确更新

## 🎉 成功部署！

完成上述步骤后，您的自动化监控系统就开始工作了：

- **每2小时**自动同步配置并执行监控
- **Google Sheets**统一管理所有监控网站
- **自动记录**所有监控执行日志
- **保持原有**的飞书通知功能
- **智能同步**，只在需要时更新配置

现在您可以专注于添加要监控的网站，系统会自动处理一切！🚀