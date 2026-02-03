# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 安装构建依赖（better-sqlite3 需要）
RUN apk add --no-cache python3 make g++

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建
RUN npm run build

# 运行阶段
FROM node:20-alpine

WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache python3 make g++

# 复制依赖文件
COPY package*.json ./

# 只安装生产依赖
RUN npm ci --only=production

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 创建数据目录
RUN mkdir -p /app/data

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/litepad.db

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# 启动命令
CMD ["node", "dist/index.js"]
