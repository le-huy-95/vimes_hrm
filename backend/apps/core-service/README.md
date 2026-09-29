# core-service

**Port:** `3203`  
**Mục đích:** Nghiệp vụ tổ chức — org, group, task, invite, phân quyền.

## Modules

| Module | Mục đích |
|--------|----------|
| `modules/org` | Tạo org, danh sách, mời thành viên, chấp nhận invite |
| `modules/group` | CRUD group, thêm/xóa member |
| `modules/task` | Task trong group (create, list, claim, complete) |
| `modules/access` | Kiểm tra quyền org/group |

## Infra

- `infra/outbox.service.ts` — ghi outbox event (Kafka)
- `mailer.ts` — gọi worker gửi email invite

Gateway proxy: `/organizations`, `/invitations`, `/groups`.
