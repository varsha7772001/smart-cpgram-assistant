import { useState } from "react";
import { supabase } from "../../lib/supabase";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthPage({ onTryDemo }) {
  const [mode, setMode] = useState("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState({ type: "", text: "" });
  const [submitting, setSubmitting] = useState(false);
  const isSignUp = mode === "signup";

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErrors({});
    setMessage({ type: "", text: "" });
    setPassword("");
    setConfirmPassword("");
  };

  const validate = () => {
    const next = {};
    if (isSignUp && !fullName.trim()) next.fullName = "Full name is required.";
    if (!email.trim()) next.email = "Email is required.";
    else if (!emailPattern.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Password is required.";
    else if (isSignUp && password.length < 8) next.password = "Password must be at least 8 characters.";
    if (isSignUp && !confirmPassword) next.confirmPassword = "Please confirm your password.";
    else if (isSignUp && password !== confirmPassword) next.confirmPassword = "Passwords do not match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    if (!validate()) return;
    setSubmitting(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage({
            type: "success",
            text: "Account created. Please check your email and verify your account before signing in.",
          });
          setPassword("");
          setConfirmPassword("");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Authentication failed. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (field) =>
    `mt-2 w-full rounded-lg border bg-white px-3 py-2.5 text-gray-900 outline-none transition focus:ring-2 focus:ring-blue-100 ${
      errors[field] ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-blue-700"
    }`;

  const fieldError = (field, id) => errors[field] && (
    <p id={id} className="mt-1 text-sm text-red-700">{errors[field]}</p>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
        <header className="border-b-4 border-amber-500 bg-blue-950 px-6 py-7 text-white sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">Citizen Services</p>
          <h1 className="mt-2 text-2xl font-bold">Smart CPGRAM Assistant</h1>
          <p className="mt-2 text-sm text-blue-100">AI-assisted grievance preparation for citizens</p>
        </header>

        <div className="p-6 sm:p-8">
          <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Authentication mode">
            {[["login", "Login"], ["signup", "Sign Up"]].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => switchMode(value)}
                className={`cursor-pointer rounded-md px-4 py-2 text-sm font-semibold transition ${
                  mode === value ? "bg-white text-blue-950 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            {isSignUp && (
              <div>
                <label htmlFor="full-name" className="text-sm font-medium text-gray-800">Full Name</label>
                <input id="full-name" type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass("fullName")} aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? "full-name-error" : undefined} />
                {fieldError("fullName", "full-name-error")}
              </div>
            )}
            <div>
              <label htmlFor="email" className="text-sm font-medium text-gray-800">Email</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass("email")} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />
              {fieldError("email", "email-error")}
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium text-gray-800">Password</label>
              <div className="relative">
                <input id="password" type={showPassword ? "text" : "password"} autoComplete={isSignUp ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass("password")} pr-16`} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined} />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 mt-1 -translate-y-1/2 cursor-pointer text-sm font-medium text-blue-800" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
              </div>
              {fieldError("password", "password-error")}
            </div>
            {isSignUp && (
              <div>
                <label htmlFor="confirm-password" className="text-sm font-medium text-gray-800">Confirm Password</label>
                <input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass("confirmPassword")} aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined} />
                {fieldError("confirmPassword", "confirm-password-error")}
              </div>
            )}

            {message.text && (
              <p role={message.type === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${message.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>
                {message.text}
              </p>
            )}
            <button type="submit" disabled={submitting} className="w-full cursor-pointer rounded-lg bg-blue-900 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? (isSignUp ? "Creating account..." : "Signing in...") : isSignUp ? "Create Account" : "Sign In"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            {isSignUp ? "Already have an account?" : "New to Smart CPGRAM Assistant?"}{" "}
            <button type="button" onClick={() => switchMode(isSignUp ? "login" : "signup")} className="cursor-pointer font-semibold text-blue-800 hover:underline">
              {isSignUp ? "Sign in" : "Create an account"}
            </button>
          </p>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400" aria-hidden="true">
            <span className="h-px flex-1 bg-slate-200" />
            or
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <button type="button" onClick={onTryDemo} className="w-full cursor-pointer rounded-lg border-2 border-blue-900 px-4 py-3 font-semibold text-blue-900 transition hover:bg-blue-50">
            Try Demo
          </button>
          <p className="mt-2 text-center text-sm text-slate-500">Uses synthetic data. No account required.</p>
        </div>
      </section>
    </main>
  );
}

export default AuthPage;
