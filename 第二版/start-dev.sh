#!/bin/bash
# 本地开发环境快速启动脚本

echo "🚀 启动羽毛球社团管理平台本地开发环境..."
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未检测到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 错误：未检测到 npm"
    exit 1
fi

echo "✅ npm 版本: $(npm --version)"

# 检查 Netlify CLI
if ! command -v netlify &> /dev/null; then
    echo "⚠️  未检测到 Netlify CLI，正在安装..."
    npm install -g netlify-cli

    if [ $? -ne 0 ]; then
        echo "❌ 安装失败，请手动执行: npm install -g netlify-cli"
        exit 1
    fi

    echo "✅ Netlify CLI 安装成功"
fi

echo "✅ Netlify CLI 版本: $(netlify --version)"
echo ""

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件"
    echo "正在从 .env.example 创建 .env 文件..."

    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ 已创建 .env 文件"
        echo "⚠️  请编辑 .env 文件，填入你的 Supabase 配置"
        echo ""
        read -p "按回车键继续..."
    else
        echo "❌ 错误：未找到 .env.example 文件"
        exit 1
    fi
else
    echo "✅ 找到 .env 文件"
fi

echo ""

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装项目依赖..."
    npm install

    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi

    echo "✅ 依赖安装完成"
else
    echo "✅ 项目依赖已安装"
fi

echo ""
echo "🎉 准备完成！正在启动开发服务器..."
echo ""
echo "📝 提示："
echo "  - 访问: http://localhost:8888"
echo "  - 主页: http://localhost:8888/index.html"
echo "  - 管理员后台: http://localhost:8888/admin.html"
echo "  - 按 Ctrl+C 停止服务器"
echo ""
sleep 2

# 启动开发服务器
netlify dev
