# Sitemap监控 - n8n集成方案

## 📋 概述

本方案将现有的sitemap-diff项目与n8n工作流平台集成，实现：
- 通过Google Sheets管理监控网站
- 自动化同步配置并执行监控任务
- 监控结果数据留存和分析
- 保持现有的飞书通知功能

## 🏗️ 架构设计

```
Google Sheets ←→ n8n统一工作流 ←→ Cloudflare Worker ←→ 飞书通知
     ↓                ↓                    ↓              ↓
  网站配置        智能配置同步           监控逻辑        自动通知
  监控日志        定时执行监控           数据处理        历史记录
```

## 📊 Google Sheets 结构

### 表1: sitemap-config (网站配置)
| 列名 | 说明 | 示例 |
|------|------|------|
| website_name | 网站名称 | "Cloudflare博客" |
| sitemap_url | Sitemap URL | "https://blog.cloudflare.com/sitemap.xml" |
| status | 监控状态 | "active/inactive" |
| last_check | 最后检查时间 | "2025-07-04 10:00:00" |
| created_at | 添加时间 | "2025-07-04 09:00:00" |
| notes | 备注 | "重要客户网站" |

### 表2: monitoring-logs (监控日志)
| 列名 | 说明 | 示例 |
|------|------|------|
| timestamp | 执行时间 | "2025-07-04 10:00:00" |
| sync_action | 同步操作 | "skip" / "add:2 remove:1" |
| monitoring_status | 监控状态 | "completed" / "failed" |
| worker_message | Worker响应消息 | "Monitoring completed successfully" |
| success | 执行成功状态 | TRUE / FALSE |

## 🔧 工作流设计

### 统一工作流 (sitemap-monitoring-workflow.json)
**功能**: 配置同步 + 监控执行 + 结果记录
**触发**: 每2小时自动执行

**完整流程**:
```
1. ⏰ 定时触发 (每2小时)
2. 📊 读取Google Sheets配置
3. 🔍 获取Worker当前配置
4. 🧠 智能分析配置差异
   ├─ 有差异 → 同步配置 → 执行监控
   └─ 无差异 → 直接执行监控
5. 📝 保存监控日志到Sheets
6. 🔄 更新最后检查时间
7. 📲 发送完成通知
```

**智能同步逻辑**:
- **新增监控**: Sheet中active但Worker中没有的网站
- **删除监控**: Worker中有但Sheet中inactive或不存在的网站
- **跳过同步**: 配置完全一致时直接执行监控

## 🚀 部署步骤

### 第一步: 准备Google Sheets (5分钟)

1. **创建Google Sheets文档**
   - 访问 https://sheets.google.com
   - 创建名为"Sitemap监控数据"的文档

2. **创建工作表**
   - 工作表1: `sitemap-config`
   - 工作表2: `monitoring-logs`

3. **导入模板数据**
   - 将 `google-sheets-template.csv` 内容复制到 `sitemap-config` 表
   - 将 `monitoring-logs-template.csv` 内容复制到 `monitoring-logs` 表

4. **获取表格ID**
   - 从URL提取: `https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit`

### 第二步: 配置n8n (10分钟)

1. **登录n8n**
   - 访问 https://n8n.zhelogic.com/

2. **配置Google Sheets凭证**
   - Settings → Credentials → Create New
   - 选择 "Google Sheets OAuth2 API"
   - 完成OAuth2授权

3. **导入工作流**
   - Import from File → 选择 `sitemap-monitoring-workflow.json`

### 第三步: 修改配置 (5分钟)

**更新工作流中的配置**:
```json
// 替换所有出现的:
"documentId": "YOUR_GOOGLE_SHEET_ID"
// 改为:
"documentId": "你的实际Sheet ID"

// 替换所有出现的:
"url": "https://YOUR_WORKER_DOMAIN.workers.dev"
// 改为:
"url": "https://你的Worker域名.workers.dev"
```

### 第四步: 测试运行 (5分钟)

1. **手动测试工作流**
   - 在n8n中手动执行工作流
   - 检查每个节点是否正常运行

2. **验证结果**
   - 确认Google Sheets数据正确更新
   - 验证Worker监控正常执行
   - 检查飞书通知是否发送

## 📈 使用方法

### 添加新网站监控

1. **在Google Sheets中添加**
   ```
   website_name: "新技术博客"
   sitemap_url: "https://techblog.example.com/sitemap.xml"
   status: "active"
   created_at: "2025-07-04 10:00:00"
   notes: "关注新技术动态"
   ```

2. **自动生效**
   - 下次工作流执行时自动检测并添加到监控
   - 查看 `monitoring-logs` 表确认同步成功

### 暂停网站监控

1. **修改状态**
   - 将 `status` 改为 "inactive"

2. **自动移除**
   - 系统会自动从Worker中移除该网站的监控

### 查看监控状态

1. **实时状态**
   - 查看 `sitemap-config` 表的 `last_check` 时间

2. **执行日志**
   - 查看 `monitoring-logs` 表了解每次执行详情

## ⚙️ 高级配置

### 修改监控频率

编辑工作流中的Cron表达式:
```json
"value": "0 */2 * * *"  // 每2小时
"value": "0 */4 * * *"  // 每4小时
"value": "0 9,21 * * *" // 每天9点和21点
```

### 自定义通知消息

修改"发送完成通知"节点:
```json
"message": "📊 自定义监控报告\\n时间: {{ $json.timestamp }}\\n状态: {{ $json.worker_status }}"
```

### 添加错误处理

在HTTP请求节点添加:
```json
"continueOnFail": true,
"options": {
  "retry": {
    "enabled": true,
    "maxRetries": 3
  }
}
```

## 🔍 故障排除

### 常见问题

**1. Google Sheets权限错误**
- 重新配置OAuth2凭证
- 确认账户有读写权限

**2. Worker API调用失败**
- 检查Worker域名是否正确
- 确认Worker服务正常运行

**3. 配置同步失败**
- 检查Sheet数据格式是否正确
- 验证API响应格式

**4. 时间格式错误**
- 确保时间格式为 "YYYY-MM-DD HH:mm:ss"

### 调试方法

1. **查看执行日志**
   - 在n8n界面查看工作流执行历史
   - 检查每个节点的输入输出

2. **测试单个节点**
   - 使用"Test Step"功能
   - 验证数据流转是否正确

3. **验证数据格式**
   - 检查Google Sheets数据格式
   - 确认API返回格式正确

## 📊 监控数据分析

### 通过Google Sheets分析

1. **创建图表**
   - 使用监控日志数据创建趋势图
   - 分析监控成功率和故障模式

2. **数据透视表**
   - 按网站分析监控频次
   - 统计同步操作频率

3. **条件格式**
   - 高亮显示失败的监控记录
   - 标记长时间未更新的网站

## 🎯 最佳实践

### 性能优化

1. **合理设置监控频率**
   - 根据网站更新频率调整
   - 避免过于频繁的检查

2. **数据管理**
   - 定期清理过期的监控日志
   - 保留关键的统计数据

### 运维建议

1. **监控告警**
   - 设置工作流执行失败告警
   - 监控长时间无响应的网站

2. **备份策略**
   - 定期备份Google Sheets数据
   - 保存工作流配置副本

## 📞 技术支持

遇到问题时的检查顺序:
1. 查看n8n执行日志
2. 验证Google Sheets权限和数据格式
3. 确认Cloudflare Worker服务状态
4. 检查网络连接和API响应

---

**注意**: 请确保所有配置中的ID、域名和凭证信息都已正确替换为实际值。