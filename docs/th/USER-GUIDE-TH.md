# คู่มือ Ceo Knowledge ภาษาไทย

## Ceo Knowledge คืออะไร

Ceo Knowledge คือส่วนความจำและเลขาส่วนตัวของ Ceo ที่เก็บข้อมูลสำคัญไว้บน Supabase ทำให้สามารถเปิดจากมือถือหรือคอมพิวเตอร์เครื่องอื่นได้ แม้เครื่องที่บ้านจะปิดอยู่ ส่วนงานที่ต้องใช้ไฟล์ในเครื่อง, Ollama, Browser หรือ MCP Runtime จะทำได้เมื่อเครื่องเป้าหมายออนไลน์เท่านั้น

## ที่อยู่ใช้งาน

- Ceo Mobile: `https://ceo-knowledge.pages.dev`
- Cloud API: `https://ceo.disomanceo.workers.dev`

## เข้าใช้งาน

1. เปิด Ceo Mobile ใน Chrome/Safari บนมือถือหรือคอมพิวเตอร์
2. Login ด้วยบัญชี Supabase/Ceo เดิม
3. เมื่อ Login สำเร็จ จะเห็น 5 หน้า: Chat, Today, Memory, Tasks และ Devices

## หน้า Chat

ใช้ถามความจำหรือข้อมูลที่ Ceo เก็บไว้ เช่น

- `เมื่อวานเราตกลงเรื่อง Ceo Knowledge ว่ายังไง`
- `วันนี้มีอะไร`
- `งานค้างมีอะไร`
- `จำไว้ว่า วันศุกร์ต้องเตรียมเอกสาร PA`

ถ้ายังไม่ได้ตั้ง Cloud AI, Chat จะตอบจากข้อมูลใน Ceo Knowledge โดยตรงก่อน ระบบยังใช้งานได้โดยไม่ต้องมี LLM แบบเสียเงิน

## หน้า Today

แสดงนัด/กิจกรรมของวันนี้ และงานที่ยังเปิดอยู่ ข้อมูลมาจาก Supabase โดยตรงจึงดูได้แม้ PC ทุกเครื่องปิด

## หน้า Memory

- เพิ่ม Memory ใหม่ได้
- ค้นหาความจำได้
- กด `ลืม` เพื่อเปลี่ยนสถานะเป็น forgotten แบบ soft delete
- ข้อมูลที่ลืมแล้วจะไม่ถูกดึงมาเป็น Active Memory แต่ยังคงมีประวัติสำหรับ recovery

## หน้า Tasks

- เพิ่มงานใหม่
- ดูสถานะงาน
- กดวงกลมด้านซ้ายเพื่อ mark completed
- งานค้างยังดูได้จากมือถือแม้ Runtime ปิด

## หน้า Devices

ใช้เชื่อมเครื่อง Windows ที่รัน Ceo MCP Agent

1. เปิด Ceo MCP Agent ที่เครื่องเป้าหมาย
2. Device Agent จะ register เครื่องเข้า Ceo Knowledge และแสดงรหัส Pairing 6 หลัก
3. ที่มือถือเปิด Devices แล้วกรอกรหัส 6 หลัก
4. เมื่อ Pair สำเร็จ เครื่องจะเป็น `TRUSTED`
5. ถ้าเครื่องออนไลน์ สามารถส่ง Remote Job ที่อยู่ในรายการอนุญาตได้

Remote V1.2 ไม่มี raw PowerShell จากมือถือ รายการที่อนุญาตเริ่มจากงานอ่าน/ตรวจสอบ เช่น runtime status, system info, knowledge recall, events/tasks, document read, filesystem read, Ollama status/chat

## ถ้าเครื่องปิด

ยังทำได้:

- Chat กับ Memory/Knowledge ที่อยู่บน Cloud
- ดู Today
- ดู Tasks
- ค้น Memory
- ดู Devices ว่า Offline

ทำไม่ได้จนกว่าเครื่องจะเปิด:

- อ่านไฟล์ Local จริง
- ใช้ Ollama ของเครื่อง
- เปิด Browser/โปรแกรมในเครื่อง
- Remote MCP Job ที่ต้องใช้ Runtime

## ติดตั้งเป็น PWA

บน Android/Chrome ใช้เมนู `Install app` หรือ `Add to Home screen` ส่วน iPhone/iPad ใช้ Share > Add to Home Screen

## ข้อควรระวัง

- ห้ามบันทึก Password, API Key, Token หรือข้อมูลลับลง Memory แบบข้อความธรรมดา
- อย่าแชร์ Device Pairing code ให้คนอื่น
- ถ้าเครื่องสูญหาย ให้ Disable/Revoke device ก่อนใช้ต่อ
- `service_role` ของ Supabase ห้ามนำไปไว้ใน Mobile หรือ Worker client-side

## สถานะปัจจุบัน 27 สิงหาคม 2569

V1.0 Secretary Brain ใช้งานจริงแล้ว, V1.1 Worker/PWA deploy แล้ว, V1.2 Remote Runtime queue ทำ E2E ผ่านแล้ว ส่วน V2 โครงฐานข้อมูล pgvector/graph/ingestion ถูก deploy แล้ว แต่ document ingestion/connectors ยังเป็นงานรอบถัดไป
