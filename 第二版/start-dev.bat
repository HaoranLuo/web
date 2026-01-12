@echo off
REM 本地开发环境快速启动脚本 (Windows)
chcp 65001 >nul

echo 🚀 启动羽毛球社团管理平台本地开发环境...
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误：未检测到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

for /f "delims=" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js 版本: %NODE_VERSION%

REM 检查 npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误：未检测到 npm
    pause
    exit /b 1
)

for /f "delims=" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm 版本: %NPM_VERSION%

REM 检查 Netlify CLI
where netlify >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️  未检测到 Netlify CLI，正在安装...
    call npm install -g netlify-cli

    if %errorlevel% neq 0 (
        echo ❌ 安装失败，请手动执行: npm install -g netlify-cli
        pause
        exit /b 1
    )

    echo ✅ Netlify CLI 安装成功
)

for /f "delims=" %%i in ('netlify --version') do set NETLIFY_VERSION=%%i
echo ✅ Netlify CLI 版本: %NETLIFY_VERSION%
echo.

REM 检查 .env 文件
if not exist ".env" (
    echo ⚠️  未找到 .env 文件
    echo 正在从 .env.example 创建 .env 文件...

    if exist ".env.example" (
        copy .env.example .env >nul
        echo ✅ 已创建 .env 文件
        echo ⚠️  请编辑 .env 文件，填入你的 Supabase 配置
        echo.
        pause
    ) else (
        echo ❌ 错误：未找到 .env.example 文件
        pause
        exit /b 1
    )
) else (
    echo ✅ 找到 .env 文件
)

echo.

REM 安装依赖
if not exist "node_modules" (
    echo 📦 正在安装项目依赖...
    call npm install

    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )

    echo ✅ 依赖安装完成
) else (
    echo ✅ 项目依赖已安装
)

echo.
echo 🎉 准备完成！正在启动开发服务器...
echo.
echo 📝 提示：
echo   - 访问: http://localhost:8888
echo   - 主页: http://localhost:8888/index.html
echo   - 管理员后台: http://localhost:8888/admin.html
echo   - 按 Ctrl+C 停止服务器
echo.
timeout /t 2 >nul

REM 启动开发服务器
netlify dev
