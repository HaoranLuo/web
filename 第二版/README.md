# 🏸 羽毛球社团数字化管理平台

一个功能完整的羽毛球社团管理平台，支持用户系统、活动报名、库存控制、社务管理等功能。

## ✨ 功能特点

### 核心功能
- 👤 **用户系统** - 注册/登录，用户资料管理（姓名、学号、学院）
- 🎫 **活动报名** - 多分组活动报名，支持新手场/高手场分流
- 🔒 **并发控制** - 后端原子操作防止超卖，互斥锁防止重复报名
- ✅ **强制签到** - 报名后必须先完成学校活动网签到才能领票
- 📊 **社务公示** - 财务流水公示、物资管理展示
- 📱 **响应式设计** - 完美适配手机、平板、电脑

### 技术特点
- 🚀 **Serverless 架构** - 零成本部署，使用 Netlify Functions + Supabase
- 🔐 **安全可靠** - Row Level Security (RLS) 数据权限控制
- ⚡ **高性能** - 数据库索引优化，并发安全
- 🎨 **现代化 UI** - 流畅动画，优雅交互

## 📁 项目结构

```
.
├── index.html              # 主页面
├── styles.css              # 样式文件
├── script.js               # 前端逻辑（Supabase 集成）
├── database.sql            # 数据库设计脚本
├── package.json           # 项目依赖
├── netlify.toml           # Netlify 配置
├── SETUP.md               # 详细部署指南
├── netlify/
│   └── functions/
│       ├── register.js     # 抢票 API（处理并发）
│       ├── events.js       # 活动列表 API（可选）
│       └── config.js      # 配置 API（动态注入 Supabase 配置）
└── README.md              # 本文件
```

## 🚀 快速开始

### 前置要求
1. **Supabase 账号** - [注册](https://supabase.com)
2. **Netlify 账号** - [注册](https://www.netlify.com)

### 部署步骤

#### 1. 设置 Supabase
- 创建新项目
- 在 SQL Editor 中执行 `database.sql`
- 获取 API 密钥（URL、Anon Key、Service Role Key）

#### 2. 部署到 Netlify
- 上传代码到 Netlify（拖拽或 Git 连接）
- 在环境变量中设置：
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

#### 3. 添加测试数据
在 Supabase Dashboard 中手动添加活动、分组等测试数据

**详细步骤请参考 [SETUP.md](./SETUP.md)**

## 🔧 配置说明

### 环境变量

在 Netlify Dashboard > Site settings > Environment variables 中设置：

| 变量名 | 说明 | 获取位置 |
|--------|------|----------|
| `SUPABASE_URL` | Supabase 项目 URL | Supabase Dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | 匿名密钥（前端使用） | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务密钥（后端使用） | Supabase Dashboard > Settings > API |

⚠️ **安全提示**：`SUPABASE_SERVICE_ROLE_KEY` 具有完全数据库访问权限，请妥善保管，不要暴露给前端！

## 📖 核心业务流程

### 活动报名流程
1. 用户点击"新手场"报名按钮
2. 后端校验：
   - ✅ 互斥锁：检查是否已报名该活动的其他分组
   - ✅ 库存锁：检查 `claimed < capacity`
3. 原子操作：数据库事务更新库存 + 创建报名记录
4. 前端弹出签到二维码 Modal
5. 用户点击"我已签到"
6. 显示领票链接（微信小程序跳转）

### 并发控制机制
- 使用数据库 `WHERE` 条件 + `UPDATE` 实现原子性
- 触发器自动更新 `claimed` 计数
- 后端 API 处理所有库存判断，前端不参与

## 🛠️ 技术栈

- **前端**: HTML5, CSS3, Vanilla JavaScript
- **后端**: Netlify Functions (Node.js)
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth
- **部署**: Netlify

## 📝 开发说明

### 本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务器（需要 Netlify CLI）
npm run dev

# 或使用简单 HTTP 服务器
npx http-server
```

### 数据库设计

主要数据表：
- `profiles` - 用户资料
- `events` - 活动表
- `event_groups` - 活动分组（新手场/高手场）
- `registrations` - 报名记录
- `finance_records` - 财务流水
- `inventory` - 物资库存

详细设计见 `database.sql`

## 🐛 常见问题

### 前端无法连接 Supabase
- 检查环境变量是否正确配置
- 检查 Supabase 项目的 API 设置

### 报名 API 返回错误
- 检查 `SUPABASE_SERVICE_ROLE_KEY` 是否设置
- 检查数据库 RLS 策略

### 并发抢票仍然超卖
- 检查数据库触发器是否正确创建
- 确认 `update_group_claimed()` 函数正常工作

更多问题请参考 [SETUP.md](./SETUP.md) 中的故障排除部分。

## 📚 相关文档

- [详细部署指南](./SETUP.md)
- [Supabase 文档](https://supabase.com/docs)
- [Netlify Functions 文档](https://docs.netlify.com/functions/overview/)

## 📄 许可证

MIT License

## 🙏 致谢

感谢使用本平台！如有问题或建议，欢迎反馈。

---

**祝使用愉快！** 🎉
