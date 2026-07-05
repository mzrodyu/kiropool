# KiroPool

KiroPool 是一个 Kiro IDE 拼车凭证管理工具。

一句话说明：车头把完整 Kiro 凭证放到服务端，用户只拿到不带刷新令牌的临时凭证，再用便携客户端一键导入到自己的 Kiro。

## 这套东西怎么搭配

它分两部分：

- 服务端网站：给车头上传凭证、创建用户、给用户下载拼车用户凭证。
- 便携客户端：给用户把下载好的 JSON 自动写进 Kiro 登录缓存，并启动 Kiro。

用户不用看懂 Kiro 凭证路径，也不用手动复制文件。

## 重要规则

不要把完整 Kiro JSON 凭证发给普通用户。

完整凭证里通常有刷新令牌，应该只放在服务端。用户下载到的是拼车用户凭证，里面不应该有完整刷新令牌。

不要提交这些东西到 Git：

- `apps/server/data/`
- `dist/`
- `.env`
- `kiro-auth-token.json`
- 任何真实 Kiro 凭证

## 本地启动

先安装依赖：

```bash
npm install
```

启动服务端网站：

```bash
npm run server
```

打开：

```text
http://localhost:47831/
```

第一次打开会出现初始化页面。你在网页里设置管理员密钥，后面车头管理就用这个密钥。

如果你更喜欢用环境变量，也可以提前设置 `KIROPOOL_ADMIN_TOKEN`。设置了环境变量时，网页会直接认为已经初始化。

## 跨电脑使用

如果服务端不是跑在用户自己的电脑上，就不要让用户填本机地址。

正式使用建议给服务端套一个域名，用户只需要填你的服务地址。

服务端正常启动即可：

```powershell
npm run server
```

第一次打开域名时，在网页里完成初始化。

然后用户访问你的域名，例如：

```text
https://你的域名/
```

如果你用 Nginx、宝塔、1Panel、Cloudflare Tunnel 或其他反代工具，就把域名反代到服务端实际监听的端口。需要改监听地址时，用 `KIROPOOL_HOST` 按你的部署方式配置即可。README 不写真实 IP，避免用户照抄或暴露部署信息。

## 车头怎么用

1. 打开服务端网站。
2. 如果是第一次启动，先按页面提示设置管理员密钥。
3. 切到“车头管理”。
4. 填管理员密钥。
5. 粘贴完整 Kiro JSON 凭证。
6. 点“上传车头凭证”。
7. 在“创建用户”里创建用户密钥和额度。
8. 把用户密钥发给用户。

完整凭证只应该由车头上传，不要直接发给用户。

## 用户怎么用

用户有两种用法。

第一种：网页下载 + 便携客户端导入。

1. 打开服务端网站。
2. 在“用户下载”里输入用户密钥。
3. 点“下载拼车用户凭证”。
4. 得到 `kiro-auth-token.json`。
5. 打开 `KiroPool-便携版.exe`。
6. 点“选择凭证并启动”。
7. 选择刚下载的 `kiro-auth-token.json`。
8. 客户端会自动写入 Kiro 登录缓存并启动 Kiro。

第二种：便携客户端直连服务端。

1. 打开 `KiroPool-便携版.exe`。
2. 填服务端地址，也就是车头给你的域名。
3. 填用户密钥。
4. 点“启动 Kiro”。

这种方式会自动领取临时凭证、写入本机、启动 Kiro，并且可以心跳同步额度。

## 打包便携客户端

```bash
npm run dist:client
```

输出文件：

```text
dist/client/KiroPool-便携版.exe
```

`dist/` 是本地构建产物，不要提交到 Git。

GitHub Actions 也会自动打包便携版，并发布到仓库右侧的 Releases。打开最新的 `KiroPool 便携版`，下载 `KiroPool-便携版.exe` 即可。

## Docker 部署测试

服务端镜像会由 GitHub Actions 自动构建并推送到 GHCR：

```text
ghcr.io/mzrodyu/kiropool-server:latest
```

最简单的测试方式：

```bash
docker run -d \
  --name kiropool \
  -p 47831:47831 \
  -v kiropool-data:/app/apps/server/data \
  ghcr.io/mzrodyu/kiropool-server:latest
```

如果你用 `compose.yml`：

```bash
docker compose up -d
```

启动后打开你的域名，按页面提示完成初始化。正式给用户用时，把你的域名反代到容器端口。用户只需要填你的域名和用户密钥。

## 开发检查

提交前跑：

```bash
npm run check
git status --short
```

确认没有运行数据、构建产物、真实凭证被提交。

## 项目结构

```text
apps/server  服务端网站和 API
apps/client  Windows 便携客户端
```

服务端默认数据文件在：

```text
apps/server/data/db.json
```

这是本地运行数据，不要提交。
