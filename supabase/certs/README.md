# 数据库 TLS CA

prod-ca-2021.crt 是 Supabase 官方公开根证书，不含私钥，用于迁移脚本的 TLS 校验。

- 来源：https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- 下载地址在 Supabase 官方控制台源码 apps/studio/hooks/custom-content/custom-content.json 的 ssl:certificate_url 中定义。
- 官方说明：https://supabase.com/docs/guides/platform/ssl-enforcement
- SHA-256 指纹：80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
- 有效期至 2031-04-26。Supabase 更换证书时，需从官方来源核对并更新。

它仅传给 PostgreSQL 连接的 ssl.ca，不安装到系统信任库。
其他 CA 可以通过本机 DATABASE_SSL_CA_FILE 指定；不关闭证书或主机名校验。
