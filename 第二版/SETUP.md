# 🏸 羽毛球社团管理平台 - 部署指南

## 📋 前置要求

1. **Supabase 账号** - [注册地址](https://supabase.com)
2. **Netlify 账号** - [注册地址](https://www.netlify.com)
3. **GitHub 账号**（可选，用于代码托管）

## 🚀 快速开始

### 第一步：设置 Supabase

1. **创建新项目**
   - 登录 [Supabase Dashboard](https://app.supabase.com)
   - 点击 "New Project"
   - 填写项目信息并创建

2. **执行数据库脚本**
   - 在 Supabase Dashboard 中，进入 "SQL Editor"
   - 复制 `database.sql` 文件中的所有内容
   - 粘贴到 SQL Editor 并执行
   - 确认所有表创建成功

3. **获取 API 密钥**
   - 进入 "Settings" > "API"
   - 复制以下值：
     - `Project URL` → 用作 `SUPABASE_URL`
     - `anon public` key → 用作 `SUPABASE_ANON_KEY`
     - `service_role` key → 用作 `SUPABASE_SERVICE_ROLE_KEY`（⚠️ 保密！）

4. **配置 Row Level Security (RLS)**
   - 数据库脚本已自动配置 RLS 策略
   - 如需调整，可在 Supabase Dashboard > Authentication > Policies 中修改

### 第二步：准备测试数据

在 Supabase Dashboard > Table Editor 中手动添加测试数据：

#### 1. 创建活动（events 表）
```sql
INSERT INTO events (title, description, status) VALUES
('周五训练', '每周五的常规训练活动', 'open');
```

#### 2. 创建分组（event_groups 表）
```sql
-- 假设活动 ID 为 1
INSERT INTO event_groups (event_id, name, capacity, checkin_img, share_link) VALUES
(1, '新手场', 7, 'https://example.com/qr-code.png', 'https://example.com/ticket-link'),
(1, '高手场', 7, 'https://example.com/qr-code.png', 'https://example.com/ticket-link');
```

#### 3. （可选）添加财务记录（finance_records 表）
```sql
INSERT INTO finance_records (type, amount, description) VALUES
('income', 1000.00, '会费收入'),
('expense', 500.00, '场地租赁费');
```

#### 4. （可选）添加物资（inventory 表）
```sql
INSERT INTO inventory (name, category, quantity, unit, description) VALUES
('羽毛球拍', 'fixed_asset', 20, '把', '专业羽毛球拍'),
('羽毛球', 'consumable', 100, '个', '比赛用球');
```

### 第三步：部署到 Netlify

#### 方法一：通过 Netlify Dashboard（推荐）

1. **准备代码**
   - 确保所有文件都在本地准备好

2. **登录 Netlify**
   - 访问 [Netlify Dashboard](https://app.netlify.com)
   - 使用 GitHub/GitLab 或邮箱登录

3. **部署网站**
   - 点击 "Add new site" → "Deploy manually"
   - 将整个项目文件夹拖拽到部署区域
   - 等待部署完成

4. **配置环境变量**
   - 进入 Site settings > Environment variables
   - 添加以下环境变量：
     ```
     SUPABASE_URL=https://your-project.supabase.co
     SUPABASE_ANON_KEY=your-anon-key
     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
     ```
   - 保存后，重新部署站点（Redeploy site）

#### 方法二：通过 Git 仓库

1. **创建 Git 仓库**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **推送到 GitHub/GitLab**
   - 在 GitHub/GitLab 创建新仓库
   - 推送代码到远程仓库

3. **连接 Netlify**
   - 在 Netlify 中点击 "Add new site" → "Import an existing project"
   - 选择你的 Git 提供商并授权
   - 选择仓库并点击 "Deploy site"

4. **配置环境变量**（同上）

#### 方法三：使用 Netlify CLI

1. **安装 Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **登录**
   ```bash
   netlify login
   ```

3. **初始化项目**
   ```bash
   netlify init
   ```

4. **设置环境变量**
   ```bash
   netlify env:set SUPABASE_URL "https://your-project.supabase.co"
   netlify env:set SUPABASE_ANON_KEY "your-anon-key"
   netlify env:set SUPABASE_SERVICE_ROLE_KEY "your-service-role-key"
   ```

5. **部署**
   ```bash
   netlify deploy --prod
   ```

### 第四步：配置前端 Supabase 连接

由于前端直接调用 Supabase，需要在 HTML 中配置或通过环境变量注入。

**方法一：修改 `index.html`（开发环境）**
在 `script.js` 中直接替换：
```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

**方法二：使用 Netlify 环境变量注入（生产环境）**
在 `netlify.toml` 中添加构建时注入脚本，或使用 Netlify 的 `_redirects` 和构建钩子。

**方法三：创建配置 API（推荐）**
创建一个简单的 Netlify Function 返回公开配置：
```javascript
// netlify/functions/config.js
exports.handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    })
  };
};
```

然后在 `script.js` 中动态加载配置。

## 🔧 配置说明

### 环境变量

| 变量名 | 说明 | 使用位置 |
|--------|------|----------|
| `SUPABASE_URL` | Supabase 项目 URL | 前端 + 后端 |
| `SUPABASE_ANON_KEY` | Supabase 匿名密钥 | 前端 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务密钥 | 后端（Netlify Functions） |

### 重要安全提示

⚠️ **永远不要**将 `SUPABASE_SERVICE_ROLE_KEY` 暴露给前端！
- 此密钥具有完全数据库访问权限
- 仅在 Netlify Functions 中使用
- 不要提交到 Git 仓库

## 📝 功能测试清单

部署完成后，请测试以下功能：

- [ ] 用户注册/登录
- [ ] 活动列表动态加载
- [ ] 活动报名（抢票）
- [ ] 签到二维码显示
- [ ] 领票链接显示
- [ ] 财务公示显示
- [ ] 物资管理显示
- [ ] 并发抢票测试（防止超卖）

## 🐛 常见问题

### 1. 前端无法连接 Supabase
- 检查 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 是否正确配置
- 检查 Supabase 项目的 API 设置是否允许跨域请求

### 2. 报名 API 返回错误
- 检查 `SUPABASE_SERVICE_ROLE_KEY` 是否在 Netlify 环境变量中正确设置
- 检查数据库 RLS 策略是否正确配置

### 3. 并发抢票仍然超卖
- 检查数据库触发器是否正确创建
- 确认 `update_group_claimed()` 函数正常工作

### 4. Modal 不显示
- 检查 CSS 文件是否正确加载
- 检查 JavaScript 控制台是否有错误

## 📚 相关文档

- [Supabase 文档](https://supabase.com/docs)
- [Netlify Functions 文档](https://docs.netlify.com/functions/overview/)
- [Netlify 环境变量](https://docs.netlify.com/environment-variables/overview/)

## 🆘 获取帮助

如遇问题，请检查：
1. 浏览器控制台错误信息
2. Netlify Functions 日志
3. Supabase 日志

---

**祝部署顺利！** 🎉
