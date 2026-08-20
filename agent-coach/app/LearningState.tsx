"use client";
import { useEffect, useState } from "react";
type Data = { task: { title:string; instruction:string; expectedOutput:string } | null; competencies: { mastery:number; confidence:number; rationale:string }[]; error?:string };
export function LearningState(){const [data,setData]=useState<Data>();useEffect(()=>{fetch("/api/learning-state").then(r=>r.json()).then(setData)},[]);if(!data)return <p>正在读取学习状态…</p>;if(data.error)return <p>{data.error}</p>;const state=data.competencies[0];return <section><h3>当前学习状态</h3>{data.task?<><h4>{data.task.title}</h4><p>{data.task.instruction}</p><p>预期产出：{data.task.expectedOutput}</p></>:<p>提交第一条学习证据后，教师会在这里分派下一任务。</p>}{state&&<p>Tool Design：掌握度 {state.mastery}/100，置信度 {state.confidence}/100。{state.rationale}</p>}</section>}
