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

## Hybrid Recall — ค้นทั้งคำตรงและความหมาย

คำสั่ง `knowledge.recall` จะค้นแบบ Keyword ก่อน แล้วถ้าเครื่องมี Ollama + embedding พร้อม ระบบจะค้น Semantic เพิ่มและรวมผลให้เอง ตัวอย่างเช่น เอกสารต้นฉบับเป็นภาษาอังกฤษ แต่ถามเป็นภาษาไทยด้วยความหมายใกล้เคียงก็ยังค้นเจอได้

ถ้า Ollama/embedding ใช้ไม่ได้ ระบบจะกลับไปใช้ Keyword เดิมโดยอัตโนมัติ ไม่ทำให้ Ceo Knowledge ล้ม และหากต้องการบังคับแบบ Keyword อย่างเดียวสามารถส่ง `semantic: false` ได้

เพื่อความปลอดภัย หากระบุ `projectId` ปัจจุบันระบบจะยังใช้ Keyword-only ก่อน จนกว่าจะเพิ่ม project filter ลง semantic RPC โดยตรง เพื่อไม่ให้ผล vector จากโปรเจกต์อื่นปะปน

## นำไฟล์ Local เข้า Ceo Knowledge (V2)

V2 รองรับการเรียนรู้จากไฟล์ที่อยู่ใน Active Project ของ Ceo Runtime แล้ว เช่น Markdown, TXT, JSON, CSV, PDF และ Office ที่ document engine รองรับ โดยหลักการคือ:

1. Ceo อ่านไฟล์ผ่าน `document.read` ภายใต้ Active Project boundary เดิม
2. เก็บ Source metadata, path, hash และสถานะไฟล์
3. ใช้ Ollama ในเครื่องสกัดหัวข้อ/สรุป/ข้อมูลสำคัญเมื่อพร้อม
4. แบ่งเนื้อหาเป็น Knowledge Chunks
5. สร้าง embedding 768 มิติด้วย `nomic-embed-text` เมื่อโมเดลพร้อม
6. บันทึก Knowledge/Chunks ลง Supabase schema `ceo_knowledge`
7. หาก ingest ไฟล์เดิมใหม่ด้วยการแบ่ง chunk แบบใหม่ ระบบจะเก็บชุดใหม่ให้สำเร็จก่อน แล้ว archive chunks เก่าที่ไม่ใช้แล้ว เพื่อลดผลค้นซ้ำจากข้อมูลเก่า

**ไฟล์ต้นฉบับไม่ได้ถูกอัปโหลดขึ้น Supabase โดยอัตโนมัติ** และ Ceo จะไม่ข้าม Active Project boundary เพื่ออ่านไฟล์นอกโปรเจกต์ หากต้องการเรียนรู้จากโฟลเดอร์อื่น ให้เปลี่ยน/Bind Active Project ตามระบบ Ceo ก่อน

ถ้า Ollama หรือ embedding model ไม่พร้อม ระบบยัง ingest แบบ text/metadata ได้และไม่ทำให้ Runtime หลักล้ม ปัจจุบัน workflow นี้ใช้งานผ่าน Ceo Runtime/MCP ก่อน ส่วน Mobile file-picker/import UI เป็นงานรอบถัดไป

Remote Runtime อนุญาตให้มือถือเรียก Semantic Search / Graph / Source metadata แบบอ่านอย่างเดียวได้ แต่ **ยังไม่อนุญาต `knowledge.ingest_file` จากมือถือ** เพื่อไม่เปิดสิทธิ์อ่านไฟล์ Local โดยไม่มี approval flow

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

## สถานะปัจจุบัน 28 สิงหาคม 2569

V1.0 Secretary Brain ใช้งานจริงแล้ว, V1.1 Worker/PWA deploy แล้ว, V1.2 Remote Runtime foundation ทำ E2E ผ่านแล้ว และ V2 File Ingestion + Ollama extraction + 768-d embedding + Semantic Search ทำ E2E ผ่านบน SCHOOL-PC แล้ว งานถัดไปคือ Hybrid Retrieval, Graph auto-link, Connectors, Web Push และ Mobile import UI
