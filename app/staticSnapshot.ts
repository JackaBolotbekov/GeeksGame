import type { ScheduleResponse, ScoreCell, StudentView } from "@/lib/types";

type StudentSnapshot = {
  id: string;
  telegramUserId: string | null;
  telegramUsername: string | null;
  displayName: string;
  avatarUrl: string | null;
  scores: Array<number | null>;
  lastScoredAt: string | null;
};

const UPDATED_AT = "2026-08-01T00:00:00.000+06:00";

function scoreCells(scores: Array<number | null>): ScoreCell[] {
  return Array.from({ length: 12 }, (_, index) => {
    const score = scores[index] ?? null;
    return {
      lessonNumber: index + 1,
      score,
      updatedAt: score === null ? null : UPDATED_AT,
    };
  });
}

function buildStudents(items: StudentSnapshot[]): StudentView[] {
  const leaderTotal = Math.max(...items.map((item) => item.scores.reduce((sum, score) => sum + (score ?? 0), 0)));
  return items.map((item, index) => {
    const scores = scoreCells(item.scores);
    const totalScore = scores.reduce((sum, cell) => sum + (cell.score ?? 0), 0);
    const completedLessons = scores.filter((cell) => cell.score !== null).length;
    return {
      ...item,
      status: "active",
      scores,
      completedLessons,
      totalScore,
      place: index + 1,
      pointsBehindLeader: leaderTotal - totalScore,
      isCurrentUser: false,
    };
  });
}

export const STATIC_STUDENTS: StudentView[] = buildStudents([
  {
    id: "static-nurel",
    telegramUserId: "6183571882",
    telegramUsername: "mishka_freddy288",
    displayName: "Нурэл Абдыкулов",
    avatarUrl: "https://t.me/i/userpic/320/SQjqQJmG9fuyE_NfIblGHqkbOutvYZgUitFDwuwNUwsoRbNLo2Y1hM06imCvuOak.svg",
    scores: [10, 10, 10, 10, 10, 10, 7, 10, null, null, null, null],
    lastScoredAt: "2026-07-30T08:54:45.899Z",
  },
  {
    id: "static-abdrakhman",
    telegramUserId: "7053726107",
    telegramUsername: "shoro_senpai",
    displayName: "Абдрахман Талайбеков",
    avatarUrl: "https://t.me/i/userpic/320/2cju4tcTFFyv5hBdMal2j57WEEoZL0MeUXsOQmrRDkBXXfdYeWu7BJ2gVN8mFJiZ.svg",
    scores: [10, 10, 10, null, 10, 10, null, null, null, null, null, null],
    lastScoredAt: "2026-07-22T11:40:25.000Z",
  },
  {
    id: "static-myrzabek",
    telegramUserId: "8338228935",
    telegramUsername: null,
    displayName: "Мырзабек Джаныбеков",
    avatarUrl: "https://t.me/i/userpic/320/jKZPkihT-LueTnLrPrnS6ysvYA4ipGw2HGc9W1sk6NI9fYQDwfiTaXXkF5kX6TR1.svg",
    scores: [10, 10, 10, null, 10, null, null, 10, null, null, null, null],
    lastScoredAt: "2026-07-31T05:32:00.040Z",
  },
  {
    id: "static-akyl",
    telegramUserId: "8696089770",
    telegramUsername: "akyl1230",
    displayName: "Акыл Мухамбетов",
    avatarUrl: "https://t.me/i/userpic/320/nqIEdT96a2PRytM8zM_rTrNiorDlArUldRoZ8QweJ-Z2-x_xEYg36On9uKIUSXIr.svg",
    scores: [10, 10, 10, null, null, null, 10, null, 10, null, null, null],
    lastScoredAt: "2026-07-31T17:00:26.194Z",
  },
  {
    id: "static-nursultan",
    telegramUserId: null,
    telegramUsername: "nurs_10",
    displayName: "Нурсултан Кубанычбеков",
    avatarUrl: "https://t.me/i/userpic/320/nurs_10.jpg",
    scores: [10, 10, 10, null, 10, null, null, null, null, null, null, null],
    lastScoredAt: "2026-07-22T12:07:53.000Z",
  },
  {
    id: "static-bayel",
    telegramUserId: "1626441675",
    telegramUsername: "dedd101",
    displayName: "Байэл Кочкорбаев",
    avatarUrl: "https://t.me/i/userpic/320/uHv-4XfiOwKZ06dTGRcqp9MZcY1FLz8OHPFT1KITjBY.svg",
    scores: [10, null, 10, null, null, null, null, 5, 5, null, null, null],
    lastScoredAt: "2026-07-31T17:01:12.159Z",
  },
  {
    id: "static-alikhan",
    telegramUserId: "8884070585",
    telegramUsername: null,
    displayName: "Алихан Муратов",
    avatarUrl: null,
    scores: [10, 10, null, null, null, null, null, null, null, null, null, null],
    lastScoredAt: "2026-07-22T09:36:15.000Z",
  },
  {
    id: "static-miras",
    telegramUserId: "5579859802",
    telegramUsername: "orozov_4",
    displayName: "Мирас Орозов",
    avatarUrl: "https://t.me/i/userpic/320/M3FG22wSaLn_32K75uhQG_aPG6UmNyb1WLNxtawl5bHQXMa8yrNhe_ExfUlYeNxr.svg",
    scores: [10, 10, null, null, null, null, null, null, null, null, null, null],
    lastScoredAt: "2026-07-22T09:42:48.000Z",
  },
  {
    id: "static-kamila",
    telegramUserId: null,
    telegramUsername: "ghiogo",
    displayName: "Камила Эркинова",
    avatarUrl: "https://t.me/i/userpic/320/ghiogo.jpg",
    scores: [10, null, null, null, null, null, null, null, null, null, null, null],
    lastScoredAt: "2026-07-21T18:49:38.000Z",
  },
  {
    id: "static-chyntemir",
    telegramUserId: "7600403430",
    telegramUsername: "chinaronaldo",
    displayName: "Чынтемир Мухамбетов",
    avatarUrl: "https://t.me/i/userpic/320/qnhyr_sIYKD1Kn-a7Yr4B_ZrU6Xpx0FhxVX29SoCzs1dvjxDHaz_P_oSWJXdHIso.svg",
    scores: [null, null, null, null, null, null, null, null, null, null, null, null],
    lastScoredAt: null,
  },
]);

export const STATIC_SCHEDULE: ScheduleResponse = {
  lessons: [
    { lessonNumber: 1, scheduledAt: "2026-07-06T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-23T11:17:21.963Z", isCompleted: true },
    { lessonNumber: 2, scheduledAt: "2026-07-08T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-23T11:17:21.963Z", isCompleted: true },
    { lessonNumber: 3, scheduledAt: "2026-07-10T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-23T11:17:21.963Z", isCompleted: true },
    { lessonNumber: 4, scheduledAt: "2026-07-13T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-23T11:17:21.963Z", isCompleted: true },
    { lessonNumber: 5, scheduledAt: "2026-07-15T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-23T11:17:21.963Z", isCompleted: true },
    { lessonNumber: 6, scheduledAt: "2026-07-20T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-23T11:17:21.963Z", isCompleted: true },
    { lessonNumber: 7, scheduledAt: "2026-07-22T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-23T11:17:21.963Z", isCompleted: true },
    { lessonNumber: 8, scheduledAt: "2026-07-27T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-24T09:50:32.549Z", isCompleted: true },
    { lessonNumber: 9, scheduledAt: "2026-07-29T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-24T09:50:32.549Z", isCompleted: true },
    { lessonNumber: 10, scheduledAt: "2026-07-31T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-24T09:50:32.549Z", isCompleted: true },
    { lessonNumber: 11, scheduledAt: "2026-08-03T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-24T09:50:32.549Z", isCompleted: false },
    { lessonNumber: 12, scheduledAt: "2026-08-05T16:00:00+06:00", courseMonth: 1, updatedAt: "2026-07-24T09:50:32.549Z", isCompleted: false },
  ],
  transfers: [
    {
      id: "static-transfer-2026-07-17",
      lessonNumber: 6,
      originalScheduledAt: "2026-07-17T16:00:00+06:00",
      rescheduledAt: "2026-07-20T16:00:00+06:00",
      reason: "Был в отъезде на ИК",
      createdAt: "2026-07-17T16:00:00+06:00",
    },
    {
      id: "static-transfer-2026-07-24",
      lessonNumber: 8,
      originalScheduledAt: "2026-07-24T16:00:00+06:00",
      rescheduledAt: "2026-07-27T16:00:00+06:00",
      reason: "Был ЧП по основной работе, весь фокус надо было направить туда",
      createdAt: "2026-07-24T09:50:32.549Z",
    },
  ],
  cancellableTransferId: null,
  months: [
    { key: "2026-07", year: 2026, month: 7, label: "июль 2026" },
    { key: "2026-08", year: 2026, month: 8, label: "август 2026" },
  ],
  currentLabel: "1 мес 10 урок",
  completedLessonCount: 10,
  currentCourseMonth: 1,
};
