import http from 'k6/http';
import { check, sleep } from 'k6';

const API_BASE = __ENV.API_URL || 'http://localhost:3001';

export const options = {
  scenarios: {
    login_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '30s', target: 0 },
      ],
    },
    payin_flow: {
      executor: 'constant-arrival-rate',
      rate: 3,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 20,
      maxVUs: 50,
      startTime: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
  },
};

let accessToken = null;

export function setup() {
  const loginRes = http.post(
    `${API_BASE}/api/auth/login`,
    JSON.stringify({ email: 'trader@p2p.local', password: 'admin123' }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(loginRes, { 'login succeeded': (r) => r.status === 200 });

  const body = JSON.parse(loginRes.body);
  return { accessToken: body.accessToken };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.accessToken}`,
  };

  const dashboardRes = http.get(`${API_BASE}/api/trader/dashboard/stats`, { headers });
  check(dashboardRes, {
    'dashboard stats OK': (r) => r.status === 200,
  });

  const ordersRes = http.get(`${API_BASE}/api/trader/payin/orders`, { headers });
  check(ordersRes, {
    'payin orders OK': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);
}
