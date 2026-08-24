// #region agent log
export function agentLog(
  _location: string,
  _message: string,
  _data: Record<string, unknown>,
  _hypothesisId: string,
) {
  /*
  fetch('http://127.0.0.1:7868/ingest/e073caa7-4494-45b7-b6d4-2e7887559346', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a5a893' },
    body: JSON.stringify({
      sessionId: 'a5a893',
      location: _location,
      message: _message,
      data: _data,
      timestamp: Date.now(),
      hypothesisId: _hypothesisId,
      runId: 'pre-fix',
    }),
  }).catch(() => {});
  */
}
// #endregion
