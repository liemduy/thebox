function AuthScreen({ authView, authBusy, authMessage, onAuth, onSwitchView }) {
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const newPasswordRef = useRef(null);
  const isReset = authView === "updatePassword";
  return (
    <div className="min-h-screen bg-black text-white font-sans flex justify-center items-start pt-0 sm:pt-8 pb-12 selection:bg-[#FFD2D7] selection:text-black">
      <div className="w-full max-w-md bg-[#0a0a0a] sm:rounded-[24px] sm:border border-[#333333] overflow-hidden min-h-screen sm:min-h-[850px] relative flex flex-col shadow-2xl">
        <div className="p-5 border-b border-[#333333] flex items-center gap-3">
          <div className="relative w-[40px] h-[40px] flex items-center justify-center bg-gradient-to-tr from-[#FFD2D7] to-[#e4b3b9] rounded-[12px] shadow-[0_0_15px_rgba(255,210,215,0.2)]">
            <span className="font-black text-[20px] text-[#111] tracking-tighter">LP</span>
          </div>
          <h1 className="font-extrabold text-[20px] tracking-tight">Liem's <span className="text-[#FFD2D7] font-medium text-[17px] italic font-serif">Planner</span></h1>
        </div>
        <main className="p-5 flex-1 flex flex-col justify-center">
          <div className="bg-[#141414] border border-white/[0.05] rounded-[24px] p-5">
            <h2 className={`text-[2.4rem] leading-[1.05] font-extrabold tracking-tighter ${isReset ? "mb-3" : "mb-6"}`}>{isReset ? "New password" : "Login"}</h2>
            {isReset ? <p className="text-[#A7A7A7] text-[14px] mb-6">Create a new password for this workspace.</p> : null}
            {isReset ? (
              <form onSubmit={(e) => { e.preventDefault(); onAuth("update-password", { password: newPasswordRef.current?.value || "" }); }} className="flex flex-col gap-3">
                <input ref={newPasswordRef} type="password" placeholder="New password" className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white outline-none focus:border-[#FFD2D7]" />
                <button disabled={authBusy} className="bg-[#FFD2D7] text-black font-bold py-3.5 rounded-[12px]">Update password</button>
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); onAuth("login", { email: emailRef.current?.value || "", password: passwordRef.current?.value || "" }); }} className="flex flex-col gap-3">
                <input ref={emailRef} type="email" placeholder="Email" autoComplete="email" className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white outline-none focus:border-[#FFD2D7]" />
                <input ref={passwordRef} type="password" placeholder="Password" autoComplete="current-password" className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white outline-none focus:border-[#FFD2D7]" />
                <button disabled={authBusy} className="bg-[#FFD2D7] text-black font-bold py-3.5 rounded-[12px]">Login</button>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" disabled={authBusy} onClick={() => onAuth("signup", { email: emailRef.current?.value || "", password: passwordRef.current?.value || "" })} className="bg-[#2D2D2D] text-white font-bold py-3 rounded-[12px]">Sign up</button>
                  <button type="button" disabled={authBusy} onClick={() => onAuth("forgot", { email: emailRef.current?.value || "" })} className="bg-[#2D2D2D] text-white font-bold py-3 rounded-[12px]">Forgot</button>
                </div>
              </form>
            )}
            {authMessage ? <div className="mt-4 text-[13px] text-[#FFD2D7]">{authMessage}</div> : null}
            {!sb && <div className="mt-4 text-[12px] text-[#A7A7A7]">Supabase script is not loaded. The app can still run locally in this browser.</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
