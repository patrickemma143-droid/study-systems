// Reading where and when a paper is from, with the AI: it copes with messy scans and unusual layouts.
import type { AiRequest } from './providers';
import { UNIVERSITIES, EXAM_TYPES } from '../../shared/origin';

export function originRequest(head: string, name: string): AiRequest {
  return {
    system: `TASK:PAPER_ORIGIN
You read the top of a university document a student uploaded (often a scanned exam paper from Uganda or East Africa) and say where and when it is from.
Reply with JSON only:
{"isPaper": true if it is an exam/test/coursework paper (not lecture notes),
 "university": full name or null (known names: ${UNIVERSITIES.map((u) => u.name).join('; ')}),
 "unit": "College/School/Faculty/Department of …" or null,
 "programme": "Bachelor of …" or null,
 "courseCode": like "BST 2101" or null,
 "courseName": the course title in normal capitalisation, or null,
 "academicYear": "2022/2023" or null,
 "semester": 1, 2 or 3 or null (Advent = 1, Easter = 2, Trinity = 3),
 "yearOfStudy": 1-7 or null,
 "examType": one of ${EXAM_TYPES.map((e) => `"${e.id}"`).join(', ')} or null,
 "month": 1-12 or null (the month the exam was sat),
 "year": the calendar year it was sat, or null,
 "date": "yyyy-mm-dd" if the exact day is written, else null,
 "duration": like "3 hours" or null,
 "evidence": {"<field>": "the exact words you read it from"}}
Only state what the text supports. Fix obvious OCR slips (e.g. "MAKERER UNIVERSlTY" is Makerere University). Never invent a university or a code.`,
    messages: [{ role: 'user', content: `FILE NAME: ${name.slice(0, 120)}\n\nTEXT:\n<<<\n${head.slice(0, 5000)}\n>>>` }],
    json: true,
    maxTokens: 700,
    temperature: 0,
  };
}
