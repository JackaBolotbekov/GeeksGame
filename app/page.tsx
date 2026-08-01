import { GeeksServiceApp } from "./GeeksServiceApp";
import { STATIC_SCHEDULE, STATIC_STUDENTS } from "./staticSnapshot";

export default function Home() {
  return <GeeksServiceApp initialStudents={STATIC_STUDENTS} initialSchedule={STATIC_SCHEDULE} staticMode />;
}
