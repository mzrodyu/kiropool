# KiroPool

Kiro 拼车账号管理。车头在网页上传完整 Kiro 凭证、创建用户；用户下载拼车用户凭证，或用便携客户端一键导入并启动 Kiro。

## 快速开始

Docker：

```bash
docker run -d --name kiropool -p 47831:47831 -v kiropool-data:/app/apps/server/data ghcr.io/mzrodyu/kiropool-server:latest
```

源码运行：

```bash
npm install
npm run server
```

打开服务端网页，第一次进入会让你设置管理员密钥。

## 便携客户端

在 Releases 下载：

```text
KiroPool-portable.exe
```

客户端用于用户切号：选择网页下载的拼车用户凭证，自动写入本机 Kiro 登录缓存并启动 Kiro。找不到 Kiro 时，在客户端里手动选择一次 `Kiro.exe`。

## 车头操作

- 上传 / 删除 / 停用车头凭证
- 同步车头额度
- 创建用户
- 查看 / 重置 / 停用 / 删除用户密钥

## 不要提交

- `apps/server/data/`
- `dist/`
- `.env`
- `AGENTS.md`
- 真实 Kiro 凭证
