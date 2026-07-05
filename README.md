# KiroPool

KiroPool 是一个 Kiro 拼车凭证管理工具。

车头在网页里上传自己的 Kiro 凭证、创建拼车用户；用户拿到密钥后，在客户端里输入服务器地址和用户密钥，就能自动领取临时凭证并启动 Kiro。

## 下载客户端

Windows 便携版：

[KiroPool-portable.exe](https://github.com/mzrodyu/kiropool/releases/download/portable-latest/KiroPool-portable.exe)

打开客户端后填写：

- 服务器地址：你的 KiroPool 网站地址
- 用户密钥：车头给你的密钥

然后点击“启动 Kiro”。客户端会自动从服务器领取临时凭证，不需要用户自己复制 Kiro 登录文件。

如果客户端找不到 Kiro，点“选择 Kiro 路径”，选择本机的 `Kiro.exe`。

## 部署服务端

Docker 一行启动：

```bash
docker run -d --name kiropool -p 47831:47831 -v kiropool-data:/app/apps/server/data ghcr.io/mzrodyu/kiropool-server:latest
```

然后打开：

```text
http://你的服务器地址:47831
```

第一次进入网页时，会让你设置管理员密钥。

## 车头怎么用

1. 打开 KiroPool 网页。
2. 进入“车头管理”。
3. 上传完整 Kiro JSON 凭证。
4. 创建拼车用户，并把用户密钥发给对方。
5. 在网页里查看车头额度、租用状态和用户列表。

车头凭证只保存在服务端，普通用户下载不到完整 Kiro 凭证。

## 用户怎么用

1. 下载 Windows 便携版客户端。
2. 填写服务器地址。
3. 填写车头给你的用户密钥。
4. 点击“启动 Kiro”。

客户端会自动切换本机 Kiro 登录状态，并启动 Kiro。

## 更新

服务端镜像：

```text
ghcr.io/mzrodyu/kiropool-server:latest
```

客户端始终在 Releases 页面下载最新版。
