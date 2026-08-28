# คู่มือ Ceo Knowledge ภาษาไทย

## Ceo Knowledge คืออะไร

Ceo Knowledge คือส่วนความจำและเลขาส่วนตัวของ Ceo ที่เก็บข้อมูลสำคัญไว้บน Supabase ทำให้สามารถเปิดจากมือถือหรือคอมพิวเตอร์เครื่องอื่นได้ แม้เครื่องที่บ้านจะปิดอยู่ ส่วนงานที่ต้องใช้ไฟล์ในเครื่อง, Ollama, Browser หรือ MCP Runtime จะทำได้เมื่อเครื่องเป้าหมายออนไลน์เท่านั้น

## ที่อยู่ใช้งาน

- Ceo Mobile: `https://ceo-knowledge.pages.dev`
- Cloud API: `https://ceo.disomanceo.workers.dev`

## เข้าใช้งาน

1. เปิด Ceo Mobile ใน Chrome/Safari บนมือถือหรือคอมพิวเตอร์
2. Login ด้วยบัญชี Supabase/Ceo เดิม
3. เมื่อ Login สำเร็จ หน้าแรกคือ **Console** และแถบล่างมี Console, Chat, Today, Tasks, Graph, Drive และ Devices ส่วน Memory เปิดจากทางลัดใน Console

## บทบาทของ Ceo Mobile

Ceo Mobile ไม่ได้มีเป้าหมายสร้าง ChatGPT ขึ้นมาใหม่ หน้าเว็บนี้ทำหน้าที่เป็น **Remote Console + Secretary Dashboard** สำหรับดูและควบคุม Ceo จากมือถือ

- ใช้ ChatGPT เป็นห้องคุย/สมองหลักเมื่อเน้นการสนทนาและ reasoning
- ใช้ Ceo Mobile ดู Today, Tasks, Devices, Remote Jobs, Knowledge Graph, Drive และสถานะระบบ
- หน้า Chat/Ollama ของ Ceo เป็น **AI สำรอง** เมื่อไม่ได้ใช้ ChatGPT
- การเปลี่ยนบทบาทนี้ไม่ได้รื้อฐานข้อมูล, Device Agent, Runtime, Knowledge หรือ security architecture เดิม

## หน้า Console

เป็นหน้าแรกหลัง Login แสดง Runtime Online, จำนวนงานค้าง, กิจกรรมวันนี้, Remote Jobs ที่กำลังทำ, System readiness และทางลัดไป Chat/Today/Tasks/Memory/Graph/Drive/Devices พร้อมรายการ Remote Jobs ล่าสุด

## หน้า Chat

เป็น Chat สำรองผ่าน Ceo Knowledge/Ollama ใช้เมื่อไม่ได้สั่งผ่าน ChatGPT เช่น

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

## Knowledge Graph — เชื่อมความรู้ที่เกี่ยวข้องกัน

เมื่อ ingest เอกสารและ embedding พร้อม Ceo สามารถสร้างความสัมพันธ์ `related_to` ระหว่าง Knowledge ที่มีความหมายใกล้กันโดยอัตโนมัติ ค่าเริ่มต้นใช้ similarity อย่างน้อย 0.60 และจำกัดไม่เกิน 5 ความสัมพันธ์ต่อการ ingest หนึ่งครั้ง

ระบบตัด self-match, รวมหลาย chunks ของ Knowledge เดียวกัน และจัดลำดับคู่ ID ให้คงที่เพื่อไม่สร้าง A→B และ B→A ซ้ำ หาก auto-link มีปัญหา เอกสารยัง ingest สำเร็จตามปกติ

คำสั่ง `knowledge.graph` จะแสดงเฉพาะ Knowledge ที่ยัง Active และไม่แสดง link ที่ปลายทางถูกลืม/Archive แล้ว

### หน้า Graph บน Ceo Mobile

หน้า **Graph** แสดง Knowledge เป็นจุดและความสัมพันธ์เป็นเส้นแบบ SVG โดยไม่ติดตั้ง graph library ขนาดใหญ่ สามารถกดจุดเพื่อดูรายละเอียด, tags, จำนวนความสัมพันธ์ และกดไปยัง Knowledge ที่เชื่อมกันได้ รวมทั้งสลับเป็นมุมมองรายการและค้นจากหัวข้อ / topic / tag / type ได้

หน้า Graph อ่าน `knowledge_entries` และ `knowledge_links` จาก Supabase Cloud โดยตรงด้วย session ของผู้ใช้ และถูกจำกัดด้วย RLS `auth.uid() = user_id` จึงดูได้แม้ PC/Runtime ทุกเครื่องปิด และไม่มี `service_role` อยู่ใน Mobile

## Chat บน Cloud — AUTO Router

หน้า Chat ใช้โหมด **AUTO** แล้ว โดยลำดับคือ:

1. คำสั่งเลขานุการที่ชัดเจน เช่น จำไว้ / วันนี้ / งานค้าง ใช้ Ceo Knowledge โดยตรง
2. ถ้ามีเครื่อง Ceo Runtime ที่ TRUSTED + ONLINE และมี Ollama ระบบส่งคำถามไปโมเดล fallback ที่กำหนดไว้ ปัจจุบันใช้ `qwen2.5vl:3b` เพื่อให้ตอบเร็วกว่า Qwen3 บนเครื่องทดลอง
3. ภายหลังถ้าเพิ่ม Cloud AI Provider จะใช้เป็น fallback เพิ่มได้
4. ถ้าไม่มี AI Provider พร้อม ระบบยังตอบจาก Ceo Knowledge ได้ตามเดิม

ระหว่าง Ollama ทำงาน หน้า Chat จะแสดงชื่อโมเดลจริง เช่น `AUTO · OLLAMA qwen2.5vl:3b` และรอ Runtime Job ให้เอง ไม่ต้องเปิดหน้า Devices ไปกด Job ด้วยมือ ถ้า Ollama ใช้ไม่ได้ ระบบจะกลับไป Knowledge fallback อัตโนมัติ

## Ceo Drive — นำเอกสาร Cloud เข้า Ceo Knowledge

หน้า **Drive** เป็น Connector ของ Ceo เอง โดย Google Drive เป็น backend ตัวแรก ใช้สิทธิ์ **อ่านอย่างเดียว** และ Ceo จะไม่ import ไฟล์ใดจนกว่าผู้ใช้กดเลือก/Preview/Import เอง

หลักความปลอดภัยของ V1:

- Google provider token อยู่ใน browser session เท่านั้น ไม่เก็บใน Supabase/Worker DB
- Worker ไม่ใช้ `service_role`
- ไม่เก็บ Google refresh token ถาวรใน V1
- Google Docs/Sheets/Slides และไฟล์ข้อความสามารถ Preview/Import บน Cloud ได้
- PDF/Word/Excel/PowerPoint จะแจ้ง **Runtime required** เพื่อให้ Ceo Runtime เป็นตัวอ่านในรุ่นถัดไป
- ไฟล์ต้นฉบับบน Drive ไม่ถูกอัปโหลดเป็น binary ไป Supabase; เก็บเฉพาะข้อความที่ผู้ใช้เลือก import และ source metadata

ขั้นตอนใช้งานหลังเปิด Google provider:

1. เปิด Drive > Connect Ceo Drive
2. อนุญาต scope Drive read-only
3. เลือกโฟลเดอร์หรือค้นไฟล์
4. กด Preview ก่อน
5. ถ้าเป็นชนิดที่รองรับ กด Import เข้า Ceo Knowledge
6. หลัง Import จะเห็น Knowledge ID และจำนวน chunks

Ceo Drive และหน้า Drive ถูก deploy ขึ้น production แล้ว ขณะนี้ Maple ยังไม่ได้เปิด Google OAuth provider ดังนั้นหน้า Drive จะต้องแสดง **Setup Required** ซึ่งถือเป็นผลทดสอบที่ถูกต้องในสถานะปัจจุบัน จนกว่าจะตั้ง Google OAuth Client ใน Supabase หนึ่งครั้ง รายละเอียดอยู่ที่ `docs/dev/CEO-DRIVE.md`

## Ceo Local Notes — โน้ต Markdown ของ Ceo

Ceo Local Notes เป็นระบบของ Ceo เองสำหรับอ่านและนำเข้าไฟล์ Markdown มาตรฐานจาก Active Project โดย **ไม่ต้องติดตั้งหรือเชื่อม SDK/API ของแอปจดโน้ตภายนอก**

- รองรับ `.md` และ `.markdown`
- `knowledge.local_notes_scan` ใช้ค้นไฟล์ Markdown แบบ bounded
- `knowledge.local_notes_import` ใช้นำเข้า โดยค่าเริ่มต้นเป็น `dryRun: true` เพื่อให้เห็นแผนก่อน
- เมื่อ import จริง จะใช้ pipeline เดิมของ Ceo: Source → Knowledge → Chunks → Embedding → Graph
- ไฟล์ต้นฉบับยังอยู่ในเครื่อง ไม่ถูกอัปโหลดเป็นไฟล์ขึ้น Supabase
- bulk import ไม่อยู่ใน Remote Safe Allowlist จึงไม่เปิดให้มือถือกวาดโฟลเดอร์ Local โดยตรง

แนวทางนี้ทำให้ Ceo ใช้โฟลเดอร์ Markdown ใด ๆ เป็นฐานโน้ตได้ โดยไม่ผูกการทำงานกับผลิตภัณฑ์หรือ runtime ของผู้ให้บริการรายอื่น

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
- ดู Knowledge Graph
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

V1.0 Secretary Brain ใช้งานจริงแล้ว, V1.1 Worker/PWA และ V1.2 Remote Runtime ทำ E2E ผ่านแล้ว, V2 File Ingestion/Semantic/Hybrid/Graph/Local Notes ทำ E2E ผ่านแล้ว และบทบาท Mobile ถูกล็อกเป็น Remote Console + Secretary Dashboard โดยคง Chat/Ollama เป็น fallback งานถัดไปคือทดสอบ Console บนมือถือจริง, สิทธิ์ Revoke/Approval, Google Drive/Calendar และ Web Push
