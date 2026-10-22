"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Images,
  LayoutDashboard,
  FolderHeart,
  Heart,
  Settings,
  Search,
  Plus,
  Upload,
  Grid2X2,
  List,
  Image as ImageIcon,
  Sparkles,
  HardDrive,
  Clock3,
  LogOut,
  Menu,
  X,
  Download,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

export type ImageItem = {
  id: string;
  uniqueId: string;
  caption: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storage: {
    provider: string;
    telegramMessageId?: string;
    externalUrl?: string;
  };
  tags: string[];
  processingStatus: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  ai?: {
    ocrText?: string;
    description?: string;
    processingStatus?: string;
  } | null;
};

type CurrentUser = {
  id: string;
  name: string;
  username?: string | null;
  email?: string | null;
};

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "All Images", icon: Images },
  { label: "Albums", icon: FolderHeart },
  { label: "Favorites", icon: Heart },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [profilePhotoAvailable, setProfilePhotoAvailable] = useState(true);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("All");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const fileRef = useRef<HTMLInputElement>(null);

  // Load user and real images on mount
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setErrorMessage(null);

        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        if (!meRes.ok) {
          router.replace("/login");
          return;
        }

        const meData = await meRes.json();
        if (!meData.user) {
          router.replace("/login");
          return;
        }

        if (isMounted) {
          setCurrentUser(meData.user);
          setProfilePhotoAvailable(true);
        }

        const imagesRes = await fetch("/api/images", { cache: "no-store" });
        if (imagesRes.ok) {
          const imagesData = await imagesRes.json();
          if (isMounted) {
            setImages(imagesData.images || []);
          }
        } else {
          const errData = await imagesRes.json().catch(() => ({}));
          if (isMounted) {
            setErrorMessage(errData.error || "Failed to load images from database.");
          }
        }
      } catch {
        if (isMounted) {
          setErrorMessage("Network error while connecting to server.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) return;

        const data = await response.json();
        if (!data.user) {
          router.replace("/login");
        }
      } catch {
        // Keep the current session on temporary network errors.
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [currentUser, router]);

  // Real upload handler connecting to POST /api/images/upload
  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadStatus("Preparing upload...");
    setErrorMessage(null);

    const fileList = Array.from(files);
    let successCount = 0;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setUploadStatus(
        `Uploading ${file.name} to Telegram Saved Messages (${i + 1}/${fileList.length})...`,
      );

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/images/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `Upload failed for ${file.name}`);
        }

        if (data.image) {
          setImages((prev) => [data.image, ...prev]);
          successCount++;
        }
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : `Failed to upload ${file.name}`,
        );
      }
    }

    setUploading(false);
    setUploadStatus(
      successCount > 0
        ? `Successfully uploaded ${successCount} image${successCount > 1 ? "s" : ""}!`
        : null,
    );

    setTimeout(() => {
      setUploadStatus(null);
    }, 4000);
  }

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const filteredImages = useMemo(() => {
    return images.filter((img) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !searchLower ||
        img.originalName.toLowerCase().includes(searchLower) ||
        img.uniqueId.toLowerCase().includes(searchLower) ||
        (img.ai?.description &&
          img.ai.description.toLowerCase().includes(searchLower)) ||
        (img.ai?.ocrText && img.ai.ocrText.toLowerCase().includes(searchLower)) ||
        img.tags.some((t) => t.toLowerCase().includes(searchLower));

      const matchesTab =
        activeTab !== "Favorites" || favorites.has(img.id);

      const matchesTag =
        selectedTag === "All" || img.tags.includes(selectedTag);

      return matchesSearch && matchesTab && matchesTag;
    });
  }, [images, search, activeTab, selectedTag, favorites]);

  const totalBytes = useMemo(() => {
    return images.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0);
  }, [images]);

  const aiProcessedCount = useMemo(() => {
    return images.filter(
      (img) =>
        img.processingStatus === "completed" ||
        img.ai?.processingStatus === "completed",
    ).length;
  }, [images]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-800">
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(event) => {
          handleUpload(event.target.files);
          event.target.value = "";
        }}
      />

      {/* Mobile overlay */}
      {mobileMenu && (
        <button
          aria-label="Close menu"
          onClick={() => setMobileMenu(false)}
          className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-200 bg-white px-5 py-6 transition-transform lg:translate-x-0 ${
          mobileMenu ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
              <Images size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                PixelVault
              </h1>
              <p className="text-xs text-slate-400">Smart Image Vault</p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenu(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Navigation
        </p>

        <nav className="space-y-1">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => {
                setActiveTab(label);
                setMobileMenu(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                activeTab === label
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon size={19} />
              {label}
              {label === "Favorites" && (
                <span className="ml-auto text-xs font-semibold text-slate-400">
                  {favorites.size}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="my-6 border-t border-slate-100" />

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3.5 text-xs text-indigo-900">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck size={16} className="text-indigo-600" />
            Telegram Storage
          </div>
          <p className="mt-1 text-indigo-700/80">
            Original images are encrypted and stored in your Telegram Saved Messages.
          </p>
        </div>

        <div className="mt-auto space-y-1">
          {currentUser && (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              {profilePhotoAvailable ? (
                <Image
                  src="/api/auth/profile-photo"
                  alt=""
                  width={36}
                  height={36}
                  unoptimized
                  onError={() => setProfilePhotoAvailable(false)}
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold uppercase text-white">
                  {currentUser.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">
                  {currentUser.name}
                </p>
                <p className="truncate text-[10px] text-slate-400">
                  {currentUser.username ? `@${currentUser.username}` : "Telegram User"}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={() => setActiveTab("Settings")}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
          >
            <Settings size={18} />
            Settings
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-h-screen lg:ml-[260px]">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileMenu(true)}
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={21} />
            </button>
            <div className="hidden text-sm text-slate-400 sm:block">
              Workspace <span className="mx-2">/</span>
              <span className="font-semibold text-slate-700">{activeTab}</span>
            </div>
            <h2 className="truncate text-base font-semibold sm:hidden">
              {activeTab}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden w-56 md:block xl:w-72">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search filename, ID, AI tags..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="hidden sm:flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-100 hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Plus size={17} />
              )}
              Upload
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-4 sm:p-8">
          {/* Notification Alerts */}
          {uploadStatus && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <span>{uploadStatus}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-xs font-semibold underline text-rose-700"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Page Greeting & Action */}
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="mb-1 text-sm text-slate-500">
                Your images, securely preserved in Telegram Saved Messages.
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {currentUser?.name ? `Welcome back, ${currentUser.name}` : "Welcome to PixelVault"} <span>👋</span>
              </h2>
            </div>

            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Upload size={18} />
              )}
              {uploading ? "Uploading to Telegram..." : "Upload images"}
            </button>
          </div>

          {/* Real Statistics Calculated from Actual Database Records */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Total images"
              value={String(images.length)}
              note="Stored in Saved Messages"
              icon={<Images size={20} />}
              color="indigo"
            />
            <StatCard
              title="Storage used"
              value={formatBytes(totalBytes)}
              note="Calculated from real records"
              icon={<HardDrive size={20} />}
              color="emerald"
            />
            <StatCard
              title="Favorites"
              value={String(favorites.size)}
              note="Marked by you"
              icon={<Heart size={20} />}
              color="rose"
            />
            <StatCard
              title="AI processed"
              value={String(aiProcessedCount)}
              note={`${images.length - aiProcessedCount} pending analysis`}
              icon={<Sparkles size={20} />}
              color="violet"
            />
          </div>

          {/* Library Toolbar */}
          <section>
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Your image library
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Real records retrieved from MongoDB and Telegram.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {["All", "Photos", "Documents"].map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(tag)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        selectedTag === tag
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <div className="flex rounded-lg border border-slate-200 bg-white p-1">
                  <button
                    onClick={() => setView("grid")}
                    aria-label="Grid view"
                    className={`rounded-md p-1.5 ${
                      view === "grid"
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-400"
                    }`}
                  >
                    <Grid2X2 size={17} />
                  </button>
                  <button
                    onClick={() => setView("list")}
                    aria-label="List view"
                    className={`rounded-md p-1.5 ${
                      view === "list"
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-400"
                    }`}
                  >
                    <List size={17} />
                  </button>
                </div>
              </div>
            </div>

            {/* Sub-header info */}
            <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
              <p>
                Showing {filteredImages.length} of {images.length} images
              </p>
              <div className="flex items-center gap-1 text-slate-500">
                <Clock3 size={14} />
                Latest first
              </div>
            </div>

            {/* Gallery View */}
            {loading ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-center">
                <Loader2 size={36} className="animate-spin text-indigo-600 mb-3" />
                <p className="text-sm font-medium text-slate-600">
                  Loading your vault...
                </p>
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                <ImageIcon className="mx-auto mb-3 text-slate-300" size={40} />
                <h4 className="font-semibold text-slate-800">
                  {images.length === 0 ? "Your vault is empty" : "No matches found"}
                </h4>
                <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
                  {images.length === 0
                    ? "Upload your first photo to store it securely in your Telegram Saved Messages."
                    : "No images matched your search criteria. Try a different term or clear filters."}
                </p>
                {images.length === 0 ? (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                  >
                    <Plus size={16} />
                    Upload now
                  </button>
                ) : (
                  <button
                    onClick={() => setSearch("")}
                    className="mt-4 text-sm font-semibold text-indigo-600 hover:underline"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div
                className={
                  view === "grid"
                    ? "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                    : "flex flex-col gap-3"
                }
              >
                {filteredImages.map((image) => (
                  <article
                    key={image.id}
                    className={`group overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-slate-200/60 cursor-pointer ${
                      view === "list" ? "flex items-center p-3" : ""
                    }`}
                    onClick={() => setSelectedImage(image)}
                  >
                    <div
                      className={`relative overflow-hidden bg-slate-100 ${
                        view === "list"
                          ? "h-20 w-24 shrink-0 rounded-xl"
                          : "aspect-[4/3]"
                      }`}
                    >
                      <Image
                        src={`/api/images/${image.id}/file`}
                        alt={image.originalName}
                        unoptimized
                        fill
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(image.id);
                        }}
                        aria-label={
                          favorites.has(image.id)
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:scale-105 hover:text-rose-500"
                      >
                        <Heart
                          size={15}
                          fill={favorites.has(image.id) ? "currentColor" : "none"}
                          className={favorites.has(image.id) ? "text-rose-500" : ""}
                        />
                      </button>

                      <div className="absolute bottom-2.5 left-2.5 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
                        {formatBytes(image.sizeBytes)}
                      </div>
                    </div>

                    <div
                      className={`flex items-center justify-between gap-3 ${
                        view === "list" ? "min-w-0 flex-1 px-4" : "p-4"
                      }`}
                    >
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-slate-800">
                          {image.originalName}
                        </h4>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{formatDate(image.createdAt)}</span>
                          <span>•</span>
                          <span className="font-mono text-[10px] text-indigo-600 truncate max-w-[120px]">
                            {image.uniqueId}
                          </span>
                        </div>
                      </div>

                      <a
                        href={`/api/images/${image.id}/file?download=true`}
                        onClick={(e) => e.stopPropagation()}
                        download={image.originalName}
                        title="Download image"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                      >
                        <Download size={17} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Footer */}
          <div className="mt-12 flex flex-col justify-between gap-2 border-t border-slate-200 py-6 text-xs text-slate-400 sm:flex-row">
            <p>© 2026 PixelVault. Secured by Telegram MTProto & MongoDB.</p>
            <p className="flex items-center gap-1">
              Your visual memory, decentralized & private <Heart size={12} />
            </p>
          </div>
        </div>

        {/* Floating Upload Button for Mobile */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Upload image"
          className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-300 transition hover:scale-105 hover:bg-indigo-700 sm:hidden disabled:opacity-50"
        >
          <Upload size={22} />
        </button>
      </main>

      {/* Image Details Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="min-w-0 pr-4">
                <h3 className="truncate font-semibold text-slate-900">
                  {selectedImage.originalName}
                </h3>
                <p className="font-mono text-xs text-slate-400">
                  {selectedImage.uniqueId}
                </p>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-6 space-y-6">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950 flex items-center justify-center">
                <Image
                  src={`/api/images/${selectedImage.id}/file`}
                  alt={selectedImage.originalName}
                  unoptimized
                  fill
                  className="object-contain"
                />
              </div>

              {/* Metadata Details Grid */}
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-slate-400">File size</p>
                  <p className="mt-1 font-semibold text-slate-700">
                    {formatBytes(selectedImage.sizeBytes)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">MIME type</p>
                  <p className="mt-1 font-semibold text-slate-700">
                    {selectedImage.mimeType}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Uploaded on</p>
                  <p className="mt-1 font-semibold text-slate-700">
                    {formatDate(selectedImage.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Telegram msg ID</p>
                  <p className="mt-1 font-semibold text-slate-700 font-mono">
                    #{selectedImage.storage?.telegramMessageId || "N/A"}
                  </p>
                </div>
              </div>

              {/* AI Metadata Section */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900">
                  <Sparkles size={16} className="text-indigo-600" />
                  AI Vision Understanding
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {selectedImage.ai?.description
                    ? selectedImage.ai.description
                    : "AI analysis is queued for this image. Descriptions and text detection will appear here automatically."}
                </p>
                {selectedImage.ai?.ocrText && (
                  <div className="mt-3 border-t border-indigo-100 pt-3">
                    <p className="text-[11px] font-semibold text-slate-500">
                      Detected Text (OCR):
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-700 bg-white/70 p-2 rounded">
                      {selectedImage.ai.ocrText}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <a
                href={`/api/images/${selectedImage.id}/file?download=true`}
                download={selectedImage.originalName}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-indigo-700"
              >
                <Download size={15} />
                Download Original
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  note,
  icon,
  color,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  color: "indigo" | "rose" | "violet" | "emerald";
}) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-600",
    rose: "bg-rose-50 text-rose-500",
    violet: "bg-violet-50 text-violet-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 transition hover:shadow-lg hover:shadow-slate-200/50">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[color]}`}
        >
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{note}</p>
    </div>
  );
}
