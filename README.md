# Wisnubot2

## Update di VPS

Masuk ke folder project di VPS:

```bash
cd /path/ke/wisnubot2
```

Ambil update terbaru dari Git:

```bash
git pull
```

Rebuild image backend dan frontend:

```bash
docker compose build
```

Jalankan ulang container:

```bash
docker compose up -d
```

Cek status container:

```bash
docker compose ps
```

Cek log kalau ada error:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

Versi singkat:

```bash
cd /path/ke/wisnubot2
git pull
docker compose up -d --build
docker compose ps
```

Catatan: jangan pakai `docker compose down -v` kecuali memang ingin menghapus volume Docker, karena data session, upload, dan konfigurasi Caddy disimpan di volume.
