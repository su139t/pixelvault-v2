
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

type Stage =
    | "starting"
    | "awaiting_code"
    | "awaiting_password"
    | "qr_ready"
    | "verifying"
    | "completed"
    | "failed";

function LoadingIndicator({ label }: { label: string }) {
    return (
        <span role="status" aria-live="polite" className="inline-flex items-center justify-center gap-2">
            <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            />
            <span>{label}</span>
        </span>
    );
}

export default function LoginPage() {
    const router = useRouter();

    const [method, setMethod] = useState<"phone" | "qr">("phone");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [authId, setAuthId] = useState("");
    const [stage, setStage] = useState<Stage>("starting");
    const [qrUrl, setQrUrl] = useState("");
    const [qrImage, setQrImage] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);

    async function postAction(body: Record<string, string>) {
        const response = await fetch("/api/auth/telegram", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Something went wrong.");
        }

        return data;
    }

    useEffect(() => {
        let active = true;
        fetch("/api/auth/me", { cache: "no-store" })
            .then((res) => res.json())
            .then((data) => {
                if (active && data?.user) {
                    router.replace("/dashboard");
                }
            })
            .catch(() => {});

        return () => {
            active = false;
        };
    }, [router]);

    useEffect(() => {
        if (!authId) return;

        let active = true;
        let redirected = false;

        async function pollStatus() {
            try {
                const response = await fetch(
                    `/api/auth/telegram?authId=${encodeURIComponent(authId)}`,
                    { cache: "no-store" },
                );
                const data = await response.json();

                if (!active) return;

                if (!response.ok) {
                    setMessage(data.error || "Login expired. Please start again.");
                    return;
                }

                setStage(data.stage);
                setMessage(data.error || "");

                if (data.qrUrl) setQrUrl(data.qrUrl);

                if (data.stage === "completed" && !redirected) {
                    redirected = true;
                    active = false;
                    router.replace("/dashboard");
                }
            } catch {
                if (active) setMessage("Could not check login status.");
            }
        }

        void pollStatus();
        const timer = setInterval(() => void pollStatus(), 1500);

        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [authId, router]);

    useEffect(() => {
        let isMounted = true;
        if (!qrUrl) {
            return;
        }

        QRCode.toDataURL(qrUrl)
            .then((url) => {
                if (isMounted) setQrImage(url);
            })
            .catch(() => {
                if (isMounted) setMessage("Could not render QR code.");
            });

        return () => {
            isMounted = false;
        };
    }, [qrUrl]);

    async function startPhone(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setMessage("");

        try {
            const data = await postAction({
                action: "startPhone",
                phoneNumber: phoneNumber.trim(),
            });

            setAuthId(data.authId);
            setStage(data.stage);
            setMessage(data.error || "");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Login failed.");
        } finally {
            setBusy(false);
        }
    }

    async function startQr() {
        setBusy(true);
        setMessage("");

        try {
            const data = await postAction({ action: "startQr" });

            setAuthId(data.authId);
            setStage(data.stage);
            setQrUrl(data.qrUrl || "");
            setMessage(data.error || "");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "QR login failed.");
        } finally {
            setBusy(false);
        }
    }

    async function verifyCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setMessage("");

        try {
            await postAction({ action: "verifyCode", authId, code: code.trim() });
            setStage("verifying");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Code verification failed.");
        } finally {
            setBusy(false);
        }
    }

    async function verifyPassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setMessage("");

        try {
            await postAction({
                action: "verifyPassword",
                authId,
                password,
            });
            setStage("verifying");
            setPassword("");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Password verification failed.");
        } finally {
            setBusy(false);
        }
    }

    function startAgain() {
        setAuthId("");
        setCode("");
        setPassword("");
        setQrUrl("");
        setQrImage("");
        setMessage("");
        setStage("starting");
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 py-8 text-white">
            <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-xl">
                <h1 className="text-3xl font-bold">PixelVault</h1>
                <p className="mt-2 text-gray-400">
                    Sign in using your Telegram account
                </p>

                {!authId ? (
                    <>
                        <div className="mt-8 grid grid-cols-2 gap-2 rounded-lg bg-gray-950 p-1">
                            <button
                                type="button"
                                onClick={() => setMethod("phone")}
                                className={`rounded-md px-3 py-3 text-sm font-medium ${method === "phone" ? "bg-blue-600" : "text-gray-400"
                                    }`}
                            >
                                Phone Number
                            </button>
                            <button
                                type="button"
                                onClick={() => setMethod("qr")}
                                className={`rounded-md px-3 py-3 text-sm font-medium ${method === "qr" ? "bg-blue-600" : "text-gray-400"
                                    }`}
                            >
                                QR Code
                            </button>
                        </div>

                        {method === "phone" ? (
                            <form onSubmit={startPhone} className="mt-6 space-y-5">
                                <label className="block text-sm font-medium" htmlFor="phone">
                                    Telegram phone number
                                </label>
                                <input
                                    id="phone"
                                    type="tel"
                                    autoComplete="tel"
                                    required
                                    value={phoneNumber}
                                    onChange={(event) => setPhoneNumber(event.target.value)}
                                    placeholder="+919876543210"
                                    className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 outline-none focus:border-blue-500"
                                />
                                <button
                                    disabled={busy}
                                    className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold disabled:cursor-wait disabled:opacity-50"
                                >
                                    {busy ? (
                                        <LoadingIndicator label="Sending Telegram code..." />
                                    ) : (
                                        "Send Telegram code"
                                    )}
                                </button>
                            </form>
                        ) : (
                            <div className="mt-6">
                                <button
                                    type="button"
                                    onClick={startQr}
                                    disabled={busy}
                                    className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold disabled:cursor-wait disabled:opacity-50"
                                >
                                    {busy ? (
                                        <LoadingIndicator label="Connecting to Telegram..." />
                                    ) : (
                                        "Generate QR code"
                                    )}
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="mt-6 space-y-5">
                        {stage === "awaiting_code" && (
                            <form onSubmit={verifyCode} className="space-y-4">
                                <label htmlFor="code" className="block text-sm font-medium">
                                    Telegram verification code
                                </label>
                                <input
                                    id="code"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    required
                                    value={code}
                                    onChange={(event) => setCode(event.target.value)}
                                    placeholder="Enter the code"
                                    className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 outline-none focus:border-blue-500"
                                />
                                <button
                                    disabled={busy}
                                    className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold disabled:cursor-wait disabled:opacity-50"
                                >
                                    {busy ? (
                                        <LoadingIndicator label="Verifying code..." />
                                    ) : (
                                        "Verify code"
                                    )}
                                </button>
                            </form>
                        )}

                        {stage === "awaiting_password" && (
                            <form onSubmit={verifyPassword} className="space-y-4">
                                <label htmlFor="password" className="block text-sm font-medium">
                                    Telegram 2-step verification password
                                </label>
                                {message && <p className="text-sm text-amber-300">{message}</p>}
                                <input
                                    id="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 outline-none focus:border-blue-500"
                                />
                                <button
                                    disabled={busy}
                                    className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold disabled:cursor-wait disabled:opacity-50"
                                >
                                    {busy ? (
                                        <LoadingIndicator label="Verifying password..." />
                                    ) : (
                                        "Verify password"
                                    )}
                                </button>
                            </form>
                        )}

                        {stage === "qr_ready" && qrImage && (
                            <div className="text-center">
                                <img
                                    src={qrImage}
                                    alt="Telegram login QR code"
                                    className="mx-auto h-52 w-52 rounded-lg bg-white p-2"
                                />
                                <p className="mt-4 text-sm text-gray-400">
                                    Telegram app → Settings → Devices → Link Desktop Device.
                                    Scan this QR code.
                                </p>
                                <div className="mt-4 text-sm text-gray-300">
                                    <LoadingIndicator label="Waiting for you to scan..." />
                                </div>
                            </div>
                        )}

                        {(stage === "starting" || stage === "verifying") && (
                            <div className="text-center text-sm text-gray-300">
                                <LoadingIndicator
                                    label={
                                        stage === "starting"
                                            ? "Connecting to Telegram..."
                                            : "Verifying your login..."
                                    }
                                />
                            </div>
                        )}

                        {stage === "failed" && (
                            <button
                                type="button"
                                onClick={startAgain}
                                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold"
                            >
                                Start again
                            </button>
                        )}

                        {message && stage !== "awaiting_password" && (
                            <p role="status" className="text-sm text-red-300">
                                {message}
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={startAgain}
                            className="w-full text-sm text-gray-400 hover:text-white"
                        >
                            Cancel and go back
                        </button>
                    </div>
                )}

                {!authId && message && (
                    <p role="status" className="mt-4 text-sm text-red-300">
                        {message}
                    </p>
                )}

                <p className="mt-6 text-xs text-gray-500">
                    Authentication is handled by the server. Never share your Telegram
                    login code or 2FA password with anyone.
                </p>
            </div>
        </main>
    );
}
