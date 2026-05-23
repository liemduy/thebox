function useAuthSession({ setCurrentUser, setBooting, hydrateUserState, hydratedRef }) {
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authView, setAuthView] = useState("login");

  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!sb) {
        const localUser = { id: "local", email: "local" };
        setCurrentUser(localUser);
        await hydrateUserState(localUser);
        return;
      }
      try {
        const { data, error } = await withTimeout(sb.auth.getSession(), CLOUD_READ_TIMEOUT_MS, "Session check");
        if (error) console.warn(error);
        if (!alive) return;
        if (data?.session?.user) {
          setCurrentUser(data.session.user);
          await hydrateUserState(data.session.user);
        } else {
          setBooting(false);
          hydratedRef.current = false;
        }
        sb.auth.onAuthStateChange(async (event, session) => {
          if (event === "PASSWORD_RECOVERY") {
            setAuthView("updatePassword");
            setBooting(false);
            return;
          }
          if (event === "SIGNED_IN" && session?.user) {
            setCurrentUser(session.user);
            await hydrateUserState(session.user);
          }
          if (event === "SIGNED_OUT") {
            hydratedRef.current = false;
            setCurrentUser(null);
            setAuthView("login");
            setAuthMessage("Logged out");
          }
        });
      } catch (error) {
        console.warn(error);
        setBooting(false);
      }
    }
    boot();
    return () => { alive = false; };
  }, []);

  async function handleAuth(action, payload) {
    if (!sb) {
      const localUser = { id: "local", email: "local" };
      setCurrentUser(localUser);
      setAuthMessage("");
      await hydrateUserState(localUser);
      return;
    }
    const email = String(payload.email || "").trim();
    const password = String(payload.password || "");
    setAuthBusy(true);
    setAuthMessage(action === "signup" ? "Signing up..." : action === "forgot" ? "Sending reset email..." : "Logging in...");
    try {
      if (action === "forgot") {
        if (!email) throw new Error("Enter email first");
        const { error } = await withTimeout(
          sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }),
          CLOUD_READ_TIMEOUT_MS,
          "Password reset"
        );
        if (error) throw error;
        setAuthMessage("Check email to reset password");
        return;
      }
      if (action === "update-password") {
        if (password.length < 6) throw new Error("Password must have at least 6 characters");
        const { error } = await withTimeout(sb.auth.updateUser({ password }), CLOUD_READ_TIMEOUT_MS, "Password update");
        if (error) throw error;
        setAuthView("login");
        setAuthMessage("Password updated");
        return;
      }
      if (!email || !password) throw new Error("Enter email and password");
      if (password.length < 6) throw new Error("Password must have at least 6 characters");
      const redirectTo = `${location.origin}${location.pathname}`;
      const result = await withTimeout(
        action === "signup"
          ? sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
          : sb.auth.signInWithPassword({ email, password }),
        CLOUD_READ_TIMEOUT_MS,
        action === "signup" ? "Sign up" : "Login"
      );
      if (result.error) throw result.error;
      const session = result.data?.session || (await withTimeout(sb.auth.getSession(), CLOUD_READ_TIMEOUT_MS, "Session check")).data?.session;
      if (session?.user) {
        setCurrentUser(session.user);
        await hydrateUserState(session.user);
      } else {
        setAuthMessage("Check email to confirm, then login again");
      }
    } catch (error) {
      setAuthMessage(error.message || "Auth error");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    hydratedRef.current = false;
    setCurrentUser(null);
    setAuthMessage("Logged out");
    if (sb) {
      try { await sb.auth.signOut({ scope: "local" }); } catch {}
    }
  }

  return {
    authBusy,
    authMessage,
    authView,
    setAuthView,
    handleAuth,
    signOut
  };
}
