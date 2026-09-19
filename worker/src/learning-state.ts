import { syncLearningProjection } from './learning-graph.ts';

/** The only server-side AppData write path. */
export async function writeLearningStateAndProjection(db:D1Database,userId:number,data:unknown,now=new Date().toISOString()){
  const previous=await db.prepare('SELECT payload FROM learning_state WHERE user_id=?').bind(userId).first<{payload:string}>();
  if(previous)await db.prepare('INSERT INTO learning_state_history(user_id,payload,saved_at) VALUES(?,?,?)').bind(userId,previous.payload,now).run();
  await db.prepare('INSERT INTO learning_state(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(userId,JSON.stringify(data),now).run();
  await syncLearningProjection(db,userId,data,now);
  await db.prepare('DELETE FROM learning_state_history WHERE user_id=? AND id NOT IN (SELECT id FROM learning_state_history WHERE user_id=? ORDER BY id DESC LIMIT 20)').bind(userId,userId).run();
  return now;
}
