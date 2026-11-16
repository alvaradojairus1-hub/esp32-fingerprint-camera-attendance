// src/api.js
export async function recordAttendance(data) {
  const res = await fetch('/backend/api/recordAttendance.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getAttendance() {
  const res = await fetch('/backend/api/getAttendance.php');
  return res.json();
}
