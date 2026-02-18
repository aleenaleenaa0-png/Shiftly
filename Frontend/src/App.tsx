import { useEffect, useState } from "react";

type StatusResponse =
  | {
      stores: number;
      users: number;
      employees: number;
      shifts: number;
      availabilities: number;
    }
  | {
      message: string;
    };

function isCounts(res: StatusResponse): res is Exclude<StatusResponse, { message: string }> {
  return (res as any).stores !== undefined;
}

function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/status");
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = (await response.json()) as StatusResponse;
        setStatus(data);
      } catch (err: any) {
        setError(err.message ?? "Failed to load status");
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  return (
    <div className="page">
      <header className="header">
        <h1>Shiftly</h1>
        <p className="subtitle">Smart workforce management for retail</p>
      </header>

      <main className="content">
        <section className="card">
          <h2>Backend Connection</h2>
          {loading && <p>Checking backend status...</p>}
          {error && (
            <p className="error">
              Could not reach backend: <span>{error}</span>
            </p>
          )}
          {!loading && !error && status && (
            <>
              {isCounts(status) ? (
                <>
                  <p>The backend is online and connected to the database.</p>
                  <div className="grid">
                    <div className="metric">
                      <span className="label">Stores</span>
                      <span className="value">{status.stores}</span>
                    </div>
                    <div className="metric">
                      <span className="label">Managers</span>
                      <span className="value">{status.users}</span>
                    </div>
                    <div className="metric">
                      <span className="label">Employees</span>
                      <span className="value">{status.employees}</span>
                    </div>
                    <div className="metric">
                      <span className="label">Shifts</span>
                      <span className="value">{status.shifts}</span>
                    </div>
                    <div className="metric">
                      <span className="label">Availabilities</span>
                      <span className="value">{status.availabilities}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p>{status.message}</p>
              )}
            </>
          )}
        </section>

        <section className="card">
          <h2>Next steps</h2>
          <ul className="list">
            <li>Create views to manage Stores, Employees and Shifts</li>
            <li>Add authentication for store managers</li>
            <li>Implement the Match Score scheduling algorithm</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

export default App;


