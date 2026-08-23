import { useEffect, useState } from "react";
import AuthPage from "./components/auth/AuthPage";
import { supabase } from "./lib/supabase";
import { fetchGrievances, saveGrievanceDraft } from "./services/grievances";
import { checkDemoDuplicate, fetchDemoGrievances } from "./services/demo";
import { checkAuthenticatedDuplicate, getGrievanceAssistance } from "./services/assistance";

function App() {
  const [session, setSession] = useState(null);
  const [appMode, setAppMode] = useState("auth");
  const [authLoading, setAuthLoading] = useState(true);
  const [complaint, setComplaint] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rewritten, setRewritten] = useState("");
  const [userHistory, setUserHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [duplicateResult, setDuplicateResult] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [assistanceError, setAssistanceError] = useState("");
  const [clarification, setClarification] = useState("");
  const [clarificationResolved, setClarificationResolved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showMatchedGrievance, setShowMatchedGrievance] = useState(false);
  const [matchDismissed, setMatchDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error("Unable to restore session:", error.message);
      setSession(data.session ?? null);
      setAppMode(data.session ? "authenticated" : "auth");
      setHistoryLoading(Boolean(data.session));
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!mounted) return;
        setSession(nextSession);
        setAppMode((currentMode) =>
          currentMode === "demo" ? "demo" : nextSession ? "authenticated" : "auth"
        );
        setHistoryLoading(Boolean(nextSession));
        if (!nextSession) setUserHistory([]);
        setAuthLoading(false);
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (appMode === "auth") return;

    let cancelled = false;
    const loadHistory = async () => {
      try {
        let grievances;
        if (appMode === "demo") {
          grievances = await fetchDemoGrievances();
        } else {
          grievances = await fetchGrievances();
        }
        if (!cancelled) {
          setUserHistory(grievances);
          setHistoryError("");
        }
      } catch (error) {
        if (!cancelled) setHistoryError(error.message);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [appMode]);

  const analyzeComplaint = async (additionalDetails = "") => {
    const baseComplaint = complaint.trim();
    if (!baseComplaint) return;
    setLoading(true);
    setResult(null);
    setRewritten("");
    setDuplicateResult(null);
    setSaveError("");
    setSaved(false);
    setAssistanceError("");
    setEditing(false);
    setMatchDismissed(false);
    setShowMatchedGrievance(false);

    try {
      const fullComplaint = additionalDetails.trim()
        ? `${baseComplaint}\n\nAdditional details supplied by the citizen: ${additionalDetails.trim()}`
        : baseComplaint;
      const assistance = await getGrievanceAssistance(fullComplaint);
      setResult(assistance);
      setRewritten(assistance.prepared_grievance);
      setClarificationResolved(assistance.missing_information.length === 0 || Boolean(additionalDetails));

      const duplicate = appMode === "demo"
        ? await checkDemoDuplicate(fullComplaint)
        : await checkAuthenticatedDuplicate({
            complaint: fullComplaint,
            categoryPath: assistance.category_path,
            history: userHistory,
          });
      setDuplicateResult(duplicate);
    } catch (error) {
      setAssistanceError(error.message || "We could not analyze this grievance. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitClarification = () => analyzeComplaint(clarification);

  const copyGrievance = async () => {
    try {
      await navigator.clipboard.writeText(rewritten);
      setToastMessage("Grievance copied to clipboard");
      setTimeout(() => setToastMessage(""), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleSave = async () => {
    if (appMode !== "authenticated" || !session || saving || saved) return;
    setSaving(true);
    setSaveError("");

    try {
      await saveGrievanceDraft({
        userId: session.user.id,
        originalComplaint: complaint.trim(),
        preparedGrievance: rewritten,
        classification: result,
      });
      setSaved(true);
      setToastMessage("Grievance saved to your account");
      setTimeout(() => setToastMessage(""), 2500);
      setHistoryLoading(true);
      const grievances = await fetchGrievances();
      setUserHistory(grievances);
      setHistoryError("");
    } catch (error) {
      setSaveError(error.message || "Unable to save this grievance.");
    } finally {
      setHistoryLoading(false);
      setSaving(false);
    }
  };

  const enterDemo = () => {
    setAppMode("demo");
    setHistoryLoading(true);
    setHistoryError("");
    setUserHistory([]);
  };

  const exitDemo = () => {
    setAppMode("auth");
    setUserHistory([]);
    setComplaint("");
    setResult(null);
    setRewritten("");
    setDuplicateResult(null);
    setAssistanceError("");
    setClarification("");
    setClarificationResolved(false);
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Logout failed:", error.message);
    setLogoutLoading(false);
  };

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div role="status" className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-blue-900" />
          <p className="mt-4 font-medium text-slate-700">Checking your session...</p>
        </div>
      </main>
    );
  }

  if (appMode === "auth") return <AuthPage onTryDemo={enterDemo} />;

  const isDemo = appMode === "demo";
  const displayName = isDemo
    ? "Demo Citizen"
    : session.user.user_metadata?.full_name || session.user.email;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">Citizen Services</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Smart CPGRAM Assistant</h1>
            {isDemo && <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">Demo Mode</span>}
          </div>
          {isDemo ? (
            <button type="button" onClick={exitDemo} className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Exit Demo</button>
          ) : (
            <button type="button" onClick={handleLogout} disabled={logoutLoading} className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
              {logoutLoading ? "Signing out..." : "Logout"}
            </button>
          )}
        </header>

        <section className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-gray-500">{isDemo ? "Exploring as" : "Logged in as"}</p>
              <p className="truncate font-semibold text-gray-900">{displayName}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">{isDemo ? "Synthetic history" : "Your grievances"}</p>
              <p className="text-xl font-bold text-gray-900">{userHistory.length}</p>
            </div>
          </div>
          {isDemo && <p className="mt-3 text-xs font-medium text-amber-800">All grievance information shown here is synthetic.</p>}
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900">{isDemo ? "Synthetic Grievance History" : "Your Recent Grievances"}</h2>
          {historyLoading && (
            <div role="status" className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              Loading your grievance history...
            </div>
          )}
          {!historyLoading && historyError && (
            <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Unable to load your grievance history: {historyError}
            </p>
          )}
          {!historyLoading && !historyError && userHistory.length === 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="font-semibold text-slate-800">{isDemo ? "No synthetic grievances available." : "No grievances yet."}</p>
              <p className="mt-1 text-sm text-slate-600">{isDemo ? "The demo dataset could not provide any history." : "Your submitted grievances will appear here."}</p>
            </div>
          )}
          {!historyLoading && !historyError && userHistory.length > 0 && (
            <div className="mt-3 space-y-3">
              {userHistory.slice(0, 5).map((grievance) => (
              <article key={grievance.grievance_id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{grievance.category_path || "Uncategorized"}</p>
                    <p className="mt-1 text-xs text-gray-500">{grievance.grievance_id}</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{grievance.status}</span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-gray-600">{grievance.original_complaint || grievance.complaint || grievance.prepared_grievance}</p>
              </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 border-t border-slate-200 pt-6">
          <p className="text-sm font-semibold text-blue-800">Lodge New Grievance</p>
          <h2 className="mt-1 text-xl font-semibold text-gray-900">Describe your problem</h2>
          <p className="mt-2 text-gray-600">Use your own words. Do not include passwords, OTPs, bank credentials, Aadhaar or PAN numbers.</p>
          <label htmlFor="complaint" className="mt-5 block text-sm font-medium text-gray-800">What happened?</label>
          <textarea id="complaint" maxLength={3000} value={complaint} onChange={(event) => setComplaint(event.target.value)} placeholder="Example: My speed post has not been delivered for 10 days..." className="mt-2 min-h-40 w-full rounded-xl border border-gray-300 p-4 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" />
          <p className="mt-1 text-right text-xs text-slate-500">{complaint.length}/3000</p>
          <button type="button" onClick={() => analyzeComplaint()} disabled={loading || !complaint.trim()} className="mt-3 cursor-pointer rounded-xl bg-blue-900 px-6 py-3 font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Preparing your grievance..." : "Continue"}
          </button>
          {assistanceError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{assistanceError}</p>}

          {result?.missing_information?.length > 0 && !clarificationResolved && (
            <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
              <h3 className="font-semibold text-blue-950">One more detail may help</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-blue-900">{result.missing_information.map((question) => <li key={question}>{question}</li>)}</ul>
              <label htmlFor="clarification" className="mt-4 block text-sm font-medium text-blue-950">Additional details</label>
              <textarea id="clarification" value={clarification} onChange={(event) => setClarification(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-blue-200 p-3 outline-none focus:border-blue-700" placeholder="Add what you know. If a reference number is unavailable, you can say so." />
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={submitClarification} disabled={loading || !clarification.trim()} className="cursor-pointer rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Continue with details</button>
                <button type="button" onClick={() => setClarificationResolved(true)} className="cursor-pointer rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-900">Continue without them</button>
              </div>
            </div>
          )}

          {duplicateResult?.possible_match && !matchDismissed && (clarificationResolved || result?.missing_information?.length === 0) && (
            <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
              <h3 className="font-bold">Possible existing grievance</h3>
              <p className="mt-1">We found a previous grievance that may relate to this issue. Similar wording does not always mean it is the same issue.</p>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div><dt className="text-amber-700">Grievance ID</dt><dd className="font-semibold">{duplicateResult.matched_grievance?.grievance_id}</dd></div>
                <div><dt className="text-amber-700">Status</dt><dd className="font-semibold">{duplicateResult.matched_grievance?.status || "Unknown"}</dd></div>
                <div><dt className="text-amber-700">Category</dt><dd className="font-semibold">{duplicateResult.matched_grievance?.category_path || "Uncategorized"}</dd></div>
                <div><dt className="text-amber-700">Similarity</dt><dd className="font-semibold">{duplicateResult.similarity}%</dd></div>
              </dl>
              {showMatchedGrievance && <p className="mt-3 rounded-lg bg-white/70 p-3">{duplicateResult.matched_grievance?.original_complaint || duplicateResult.matched_grievance?.complaint || duplicateResult.matched_grievance?.prepared_grievance}</p>}
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => setShowMatchedGrievance((shown) => !shown)} className="cursor-pointer rounded-lg border border-amber-500 px-3 py-2 font-semibold">{showMatchedGrievance ? "Hide Existing Grievance" : "View Existing Grievance"}</button>
                <button type="button" onClick={() => setMatchDismissed(true)} className="cursor-pointer rounded-lg bg-amber-900 px-3 py-2 font-semibold text-white">This Is a Different Issue</button>
              </div>
            </div>
          )}

          {result && (clarificationResolved || result.missing_information.length === 0) && (
            <div className="mt-6 rounded-xl bg-gray-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-800">Final Review</p>
              <h3 className="mt-1 text-xl font-bold text-slate-950">Review before you continue</h3>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><dt className="text-xs font-semibold uppercase text-gray-500">Suggested Department</dt><dd className="mt-1 font-semibold">{result.department}</dd></div>
                <div><dt className="text-xs font-semibold uppercase text-gray-500">Category</dt><dd className="mt-1 font-semibold">{result.category || "No controlled category identified"}</dd></div>
                {result.subcategory && <div><dt className="text-xs font-semibold uppercase text-gray-500">Sub-category</dt><dd className="mt-1 font-semibold">{result.subcategory}</dd></div>}
                <div><dt className="text-xs font-semibold uppercase text-gray-500">Routing confidence</dt><dd className="mt-1 font-semibold">{result.confidence}%</dd></div>
              </dl>
            </div>
          )}
          {rewritten && (clarificationResolved || result?.missing_information?.length === 0) && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="prepared-grievance" className="font-semibold text-gray-900">Prepared grievance</label>
                <button type="button" onClick={() => setEditing((value) => !value)} className="cursor-pointer text-sm font-semibold text-blue-800 hover:underline">{editing ? "Done Editing" : "Edit"}</button>
              </div>
              <textarea id="prepared-grievance" readOnly={!editing} value={rewritten} onChange={(event) => { setRewritten(event.target.value); setSaved(false); }} className={`mt-2 min-h-36 w-full rounded-lg border p-3 leading-relaxed outline-none ${editing ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 bg-slate-50"}`} />
              <button type="button" onClick={copyGrievance} className="mt-4 cursor-pointer rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 active:scale-95">Copy Grievance</button>
              {isDemo ? (
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Demo mode — grievances are not saved.</p>
              ) : (
                <div className="mt-4">
                  <button type="button" onClick={handleSave} disabled={saving || saved || !rewritten.trim()} className="cursor-pointer rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60">
                    {saving ? "Saving..." : saved ? "Saved" : "Save Draft"}
                  </button>
                  <p className="mt-2 text-sm font-medium text-slate-700">Saved drafts are not submitted to CPGRAMS.</p>
                  {saveError && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Unable to save grievance: {saveError}</p>}
                </div>
              )}
              <div className="mt-6 border-t border-slate-200 pt-5">
                <a href="https://pgportal.gov.in/" target="_blank" rel="noopener noreferrer" className="inline-flex rounded-lg bg-orange-700 px-5 py-3 font-semibold text-white hover:bg-orange-600">Continue to official CPGRAMS</a>
                <p className="mt-3 text-sm text-slate-600">You will review and submit the grievance yourself on the official CPGRAMS website. Nothing is submitted automatically.</p>
              </div>
            </div>
          )}
        </section>
        <footer className="mt-8 border-t border-slate-200 pt-5 text-xs leading-relaxed text-slate-500">
          Smart CPGRAM Assistant is an independent prototype and is not affiliated with or endorsed by the Government of India. Built with Codex.
        </footer>
      </div>

      {toastMessage && <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">{toastMessage}</div>}
    </main>
  );
}

export default App;
