import {
  requestStages as stages,
  customerRequestStage,
} from "./request-stages";
import RequestConversation from "./RequestConversation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import "./request-board.css";
type User = { id: string; displayName: string; accountType: "client" | "team" };
type Member = {
  userId: string;
  displayName: string;
  accountType: "client" | "team";
};
type Project = { id: string; name: string; members: Member[] };
type RequestItem = {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  workflowStage?: string;
  origin?: "customer" | "development";
  createdAt: string;
  updatedAt: string;
  creatorName: string;
  assignees: Member[];
};
type Event = {
  id: string;
  kind: string;
  body?: string;
  createdAt: string;
  actorName: string;
  actorId: string;
  status?: string;
  workflowStage?: string;
};
type Attachment = { id: string; name: string; size: number; url: string };
type Detail = {
  workflow?: {
    tasks: {
      id: string;
      title: string;
      status: string;
      resultSummary: string;
    }[];
    meetings: {
      id: string;
      title: string;
      decisionStatus: string;
      scheduledAt: string;
    }[];
  };
  request: RequestItem;
  events: Event[];
  attachments: Attachment[];
  canManage: boolean;
  canAssign: boolean;
  canUpload: boolean;
};
const types: Record<string, string> = {
  feature: "기능 추가",
  bug: "버그 수정",
  other: "기타",
};
const priorities: Record<string, string> = {
  urgent: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
};
const date = (v: string) =>
  new Date(v).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
async function api<T>(
  path: string,
  body?: object | FormData,
  method = "POST",
): Promise<T> {
  const signal = AbortSignal.timeout(body instanceof FormData ? 60000 : 15000);
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    const csrf = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!csrf.ok) throw Error("보안 확인에 실패했어요. 다시 시도해주세요.");
    headers["X-CSRF-Token"] = (await csrf.json()).csrfToken;
    if (!(body instanceof FormData))
      headers["Content-Type"] = "application/json";
  }
  const r = await fetch(`/api/workspace${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers,
    signal,
    method: body === undefined ? "GET" : method,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.message || "요청을 처리하지 못했어요.");
  return data;
}
export default function RequestBoard({
  user,
  project,
  projects,
  onBack,
  onInfo,
}: {
  user: User;
  project?: Project;
  projects: Project[];
  onBack: () => void;
  onInfo: () => void;
}) {
  const [path, setPath] = useState(window.location.pathname);
  const base = `/projects/${project?.id}/requests`;
  const suffix = path.slice(base.length).split("/").filter(Boolean);
  const isNew = suffix[0] === "new";
  const requestId = isNew ? undefined : suffix[0];
  const [list, setList] = useState<RequestItem[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const [mobileDetail, setMobileDetail] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const detailTabs = [
    { id: "content", label: "요청 내용" },
    { id: "comments", label: "댓글" },
    { id: "progress", label: "진행 상태" },
    { id: "info", label: "요청 정보" },
  ] as const;
  const [detailTab, setDetailTab] = useState<string>("content");
  useEffect(() => setDetailTab("content"), [requestId]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setMobileDetail(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const detailPanel = (id: string) => ({
    id: `request-panel-${id}`,
    role: mobileDetail ? "tabpanel" : undefined,
    "aria-labelledby": mobileDetail ? `request-tab-${id}` : undefined,
    hidden: mobileDetail && detailTab !== id,
    tabIndex: mobileDetail ? 0 : undefined,
  });
  const [sort, setSort] = useState("latest");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [type, setType] = useState("feature"),
    [priority, setPriority] = useState("normal"),
    [files, setFiles] = useState<File[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const lock = useRef(false);
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [retryRequestId, setRetryRequestId] = useState<string | null>(null);
  useEffect(() => {
    const pop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function go(next: string) {
    window.history.pushState({}, "", next);
    setPath(next);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setError("");
    setNotice("");
    window.scrollTo(0, 0);
  }
  async function refresh() {
    if (!project) return;
    if (requestId) {
      const d = await api<Detail>(`${base}/${requestId}`);
      if (window.location.pathname !== path) return;
      setDetail(d);
      setAssigned((d.request.assignees || []).map((m) => m.userId));
    } else if (!isNew) {
      const result = await api<{ requests: RequestItem[] }>(base);
      if (window.location.pathname !== path) return;
      setList(result.requests.filter((r) => r.origin !== "development"));
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setDetail(null);
    setError("");
    if (!project) {
      setLoading(false);
      return;
    }
    const job = requestId
      ? api<Detail>(`${base}/${requestId}`)
      : isNew
        ? Promise.resolve(null)
        : api<{ requests: RequestItem[] }>(base);
    job
      .then((d) => {
        if (!active || !d) return;
        if ("request" in d) {
          setDetail(d);
          setAssigned((d.request.assignees || []).map((m) => m.userId));
        } else setList(d.requests.filter((r) => r.origin !== "development"));
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, project?.id]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function addFiles(next: File[]) {
    const all = [...files, ...next];
    if (all.length > 5) {
      setError("첨부 파일은 최대 5개까지 선택해주세요.");
      return;
    }
    if (
      all.some(
        (f) => !["application/pdf", "image/jpeg", "image/png"].includes(f.type),
      )
    ) {
      setError("PDF, JPG, PNG 파일만 첨부할 수 있어요.");
      return;
    }
    if (all.reduce((n, f) => n + f.size, 0) > 20 * 1024 * 1024) {
      setError("첨부 파일의 전체 크기는 20MB 이하여야 해요.");
      return;
    }
    setFiles(all);
    setError("");
  }
  async function upload(id: string, selected: File[]) {
    const form = new FormData();
    selected.forEach((f) => form.append("files", f));
    await api(`${base}/${id}/attachments`, form);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { request } = await api<{ request: RequestItem }>(base, {
        title: title.trim(),
        description: description.trim(),
        type,
        priority,
      });
      let warning = "";
      if (files.length)
        try {
          await upload(request.id, files);
        } catch (e) {
          setRetryFiles(files);
          setRetryRequestId(request.id);
          warning =
            "요청은 저장했지만 첨부 파일을 올리지 못했어요. 아래에서 다시 시도해주세요.";
        }
      setTitle("");
      setDescription("");
      setFiles([]);
      go(`${base}/${request.id}`);
      setNotice(warning || "요청을 등록했어요. 진행 상황을 여기서 확인하세요.");
    });
  }
  if (!project)
    return (
      <main className="rb-page">
        <button className="rb-back" onClick={onBack}>
          ← 프로젝트 목록
        </button>
        <h1>프로젝트에 접근할 수 없어요</h1>
        <p>초대를 수락한 프로젝트에서 요청을 확인할 수 있어요.</p>
      </main>
    );
  return (
    <div className="rb-shell">
      <header className="rb-header">
        <div>
          <button
            className="rb-back"
            aria-label="뒤로가기"
            onClick={() => (requestId || isNew ? go(base) : onBack())}
          >
            ←
          </button>
          <strong>
            {isNew
              ? "새로운 요청 작성"
              : requestId
                ? "요청 상세"
                : project.name}
          </strong>
        </div>
        {!requestId && !isNew ? (
          <details className="rb-project-menu">
            <summary aria-label="프로젝트 메뉴">⋮</summary>
            <div>
              <button onClick={onInfo}>참여자 · 프로젝트 정보</button>
            </div>
          </details>
        ) : (
          <a href="/" className="rb-brand">
            bridgain<span>.</span>
          </a>
        )}
      </header>
      <main className="rb-page">
        {error && (
          <div className="rb-alert" role="alert">
            {error}
            <button onClick={() => void run(refresh)} disabled={busy}>
              다시 불러오기
            </button>
          </div>
        )}
        {notice && (
          <p className="rb-notice" role="status">
            {notice}
          </p>
        )}
        {retryFiles.length > 0 && requestId === retryRequestId && (
          <div className="rb-panel">
            <p>업로드 대기: {retryFiles.map((f) => f.name).join(", ")}</p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await upload(requestId!, retryFiles);
                  setRetryFiles([]);
                  setNotice("첨부 파일을 저장했어요.");
                  await refresh();
                })
              }
            >
              첨부 파일 다시 올리기
            </button>
          </div>
        )}
        {isNew ? (
          <form onSubmit={submit} className="rb-create">
            <fieldset disabled={busy} className="rb-form-content">
              <div className="rb-heading">
                <span className="rb-eyebrow">NEW REQUEST</span>
                <h1>새로운 요청 작성</h1>
                <p>필요한 내용을 알려주세요. 개발팀과 함께 해결해 나가요.</p>
              </div>
              <div className="rb-create-grid">
                <section className="rb-panel rb-fields">
                  <label>
                    프로젝트
                    <select
                      value={project.id}
                      onChange={(e) =>
                        go(`/projects/${e.target.value}/requests/new`)
                      }
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    요청 제목
                    <input
                      required
                      maxLength={160}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="예: 카카오 로그인 가이드 추가 요청"
                    />
                  </label>
                  <fieldset>
                    <legend>요청 유형</legend>
                    <div className="rb-segments">
                      {Object.entries(types).map(([key, label]) => (
                        <button
                          type="button"
                          key={key}
                          aria-pressed={type === key}
                          className={type === key ? "selected" : ""}
                          onClick={() => setType(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>우선순위</legend>
                    <div className="rb-pills">
                      {Object.entries(priorities).map(([key, label]) => (
                        <button
                          type="button"
                          key={key}
                          aria-pressed={priority === key}
                          className={priority === key ? "selected" : ""}
                          onClick={() => setPriority(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label>
                    상세 설명
                    <textarea
                      required
                      maxLength={10000}
                      rows={8}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="어떤 기능이 필요한가요? 기대하는 동작과 현재 상황을 구체적으로 적어주세요."
                    />
                  </label>
                </section>
                <aside>
                  <section className="rb-panel">
                    <h2>
                      첨부 파일 및 스크린샷 <small>선택</small>
                    </h2>
                    <label
                      className="rb-drop"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        addFiles(Array.from(e.dataTransfer.files));
                      }}
                    >
                      <span className="rb-upload-icon">↥</span>
                      <strong>파일을 드래그하거나 클릭하여 첨부</strong>
                      <span>PDF, JPG, PNG · 최대 5개 / 전체 20MB</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png"
                        aria-label="첨부 파일 선택"
                        onChange={(e) => {
                          addFiles(Array.from(e.target.files || []));
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <ul className="rb-files">
                      {files.map((f, i) => (
                        <li key={`${f.name}-${i}`}>
                          <span>
                            {f.name}
                            <small>
                              {(f.size / 1024 / 1024).toFixed(1)} MB
                            </small>
                          </span>
                          <button
                            type="button"
                            aria-label={`${f.name} 삭제`}
                            onClick={() =>
                              setFiles(files.filter((_, j) => i !== j))
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="rb-tip">
                      <strong>이렇게 작성하면 좋아요</strong>
                      <p>
                        버그라면 문제가 생긴 순서와 기대한 결과를 적어주세요.
                        화면을 첨부하면 이해하기 쉬워요.
                      </p>
                    </div>
                  </section>
                </aside>
              </div>
              <footer className="rb-submit">
                <button
                  className="rb-primary"
                  disabled={busy || !title.trim() || !description.trim()}
                >
                  {busy ? "제출 중…" : "요청 제출하기"}
                </button>
              </footer>
            </fieldset>
          </form>
        ) : loading ? (
          <p className="rb-muted" role="status">
            요청을 불러오는 중이에요…
          </p>
        ) : requestId && detail ? (
          <>
            <div className="rb-heading rd-heading">
              <span className="rb-eyebrow">{project.name}</span>
              <div className="rd-status-row">
                <span className="rb-badge">
                  {stages[customerRequestStage(detail.request)]}
                </span>
                <span title={detail.request.id}>
                  요청 ID #{detail.request.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <div className="rc-title-row">
                <h1>{detail.request.title}</h1>

              </div>
            </div>
              {mobileDetail && (
                <nav className="rb-tabs rd-mobile-tabs" role="tablist" aria-label="요청 상세">
                  {detailTabs.map((tab, index) => (
                    <button
                      key={tab.id}
                      id={`request-tab-${tab.id}`}
                      type="button"
                      role="tab"
                      aria-selected={detailTab === tab.id}
                      aria-controls={`request-panel-${tab.id}`}
                      tabIndex={detailTab === tab.id ? 0 : -1}
                      className={detailTab === tab.id ? "selected" : ""}
                      onClick={() => setDetailTab(tab.id)}
                      onKeyDown={(event) => {
                        const next = event.key === "ArrowRight" ? (index + 1) % detailTabs.length
                          : event.key === "ArrowLeft" ? (index + detailTabs.length - 1) % detailTabs.length
                          : event.key === "Home" ? 0
                          : event.key === "End" ? detailTabs.length - 1 : undefined;
                        if (next === undefined) return;
                        event.preventDefault();
                        setDetailTab(detailTabs[next].id);
                        document.getElementById(`request-tab-${detailTabs[next].id}`)?.focus();
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              )}
              <div className="rb-detail-grid rb-request-detail">
                <div>
                  <section className="rb-panel" {...detailPanel("content")}>
                    <h2>요청 내용</h2>
                    <p className="rb-description">
                      {detail.request.description}
                    </p>
                    {detail.attachments.length > 0 && (
                      <>
                        <h3>첨부 파일</h3>
                        <ul className="rb-files">
                          {detail.attachments.map((a) => (
                            <li key={a.id}>
                              <a href={a.url} target="_blank" rel="noreferrer">
                                ↗ {a.name}
                              </a>
                              <small>
                                {(a.size / 1024 / 1024).toFixed(1)} MB
                              </small>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {detail.canUpload && detail.attachments.length < 5 && (
                      <label className="rb-attach-more">
                        ＋ 첨부 파일 추가
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png"
                          disabled={busy}
                          onChange={(e) => {
                            const selected = Array.from(e.target.files || []);
                            e.target.value = "";
                            if (!selected.length) return;
                            if (
                              selected.length + detail.attachments.length > 5 ||
                              selected.reduce((sum, f) => sum + f.size, 0) +
                                detail.attachments.reduce(
                                  (sum, f) => sum + f.size,
                                  0,
                                ) >
                                20 * 1024 * 1024
                            ) {
                              setError(
                                "첨부 파일은 최대 5개, 전체 20MB까지 올릴 수 있어요.",
                              );
                              return;
                            }
                            if (
                              selected.some(
                                (f) =>
                                  ![
                                    "application/pdf",
                                    "image/png",
                                    "image/jpeg",
                                  ].includes(f.type),
                              )
                            ) {
                              setError(
                                "PDF, JPG, PNG 파일만 첨부할 수 있어요.",
                              );
                              return;
                            }
                            setRetryFiles(selected);
                            setRetryRequestId(requestId);
                            void run(async () => {
                              await upload(requestId, selected);
                              setRetryFiles([]);
                              await refresh();
                              setNotice("첨부 파일을 저장했어요.");
                            });
                          }}
                        />
                      </label>
                    )}
                  </section>
                  <div {...detailPanel("comments")}>
        <RequestConversation
          key={requestId}
          userId={user.id}
          events={detail.events}
          onSend={async (body) => {
            await api(`${base}/${requestId}/comments`, { body });
          }}
          onLoad={async () => {
            const latest = await api<Detail>(`${base}/${requestId}`);
            if (window.location.pathname === path) setDetail(latest);
            return latest.events;
          }}
        />
                  </div>
                </div>
                <aside>
                  <section className="rb-panel rd-progress" {...detailPanel("progress")}>
                    <h2>진행 상태</h2>
                    <ol>
                      {Object.entries(stages).map(([key, label]) => (
                        <li key={key} aria-current={customerRequestStage(detail.request) === key ? "step" : undefined}>
                          {label}
                        </li>
                      ))}
                    </ol>
                  </section>
                  <div {...detailPanel("info")}>
                  <details className="rd-info" open={mobileDetail || infoOpen} onToggle={(event) => { if (!mobileDetail) setInfoOpen(event.currentTarget.open); }}>
                    <summary>요청 정보</summary>

                  <section className="rb-panel rd-team-panel">
                    <h2>담당 개발팀</h2>
                    {detail.request.assignees?.length ? (
                      <ul className="rd-people">
                        {detail.request.assignees.map((member) => (
                          <li key={member.userId}>
                            <span className="rd-avatar" aria-hidden="true">
                              {member.displayName.slice(0, 1)}
                            </span>
                            <div>
                              <strong>{member.displayName}</strong>
                              <span>요청 담당자</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rd-empty">
                        아직 담당자가 배정되지 않았어요.
                      </p>
                    )}
                    {detail.canAssign && (
                      <fieldset className="rb-assignees">
                        <legend>담당자 배정</legend>
                        {project.members
                          .filter((m) => m.accountType === "team")
                          .map((m) => (
                            <label key={m.userId}>
                              <input
                                type="checkbox"
                                checked={assigned.includes(m.userId)}
                                onChange={(e) =>
                                  setAssigned(
                                    e.target.checked
                                      ? [...assigned, m.userId]
                                      : assigned.filter(
                                          (id) => id !== m.userId,
                                        ),
                                  )
                                }
                              />
                              {m.displayName}
                            </label>
                          ))}
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await api(
                                `${base}/${requestId}`,
                                { assigneeIds: assigned },
                                "PATCH",
                              );
                              await refresh();
                              setNotice("담당자를 저장했어요.");
                            })
                          }
                        >
                          담당자 저장
                        </button>
                      </fieldset>
                    )}
                  </section>

                  <section className="rb-panel">
                    <dl className="rd-summary">
                      <div>
                        <dt>요청 유형</dt>
                        <dd>{types[detail.request.type]}</dd>
                      </div>
                      <div>
                        <dt>생성 일시</dt>
                        <dd>
                          {new Date(detail.request.createdAt).toLocaleString(
                            "ko-KR",
                            {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            },
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>요청자</dt>
                        <dd>{detail.request.creatorName}</dd>
                      </div>
                      <div>
                        <dt>우선순위</dt>
                        <dd>{priorities[detail.request.priority]}</dd>
                      </div>
                    </dl>
                  </section>
                  </details>
                  </div>
                </aside>
              </div>
          </>
        ) : !requestId ? (
          <>
            <section
              className="rb-project-overview"
              aria-labelledby="project-overview-title"
            >
              <span className="rb-eyebrow">PROJECT INFO</span>
              <h1 id="project-overview-title">{project.name}</h1>
              <div className="rb-project-members">
                {(["client", "team"] as const).map((group) => {
                  const people = project.members.filter(
                    (m) => m.accountType === group,
                  );
                  return (
                    <div className="rb-project-member-row" key={group}>
                      <span className="rb-member-label">
                        {group === "client" ? "의뢰자" : "개발팀"}
                      </span>
                      <div className="rb-member-avatars" aria-hidden="true">
                        {people.slice(0, 3).map((m) => (
                          <span
                            className={`rb-person-avatar ${group}`}
                            key={m.userId}
                          >
                            {m.displayName.slice(0, 1)}
                          </span>
                        ))}
                      </div>
                      <span className="rb-member-names">
                        {people.map((m) => m.displayName).join(", ") ||
                          "아직 참여자가 없어요"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="rb-project-counts">
                <span>
                  전체 요청: <b>{list.length}개</b>
                </span>
                <span>
                  완료됨:{" "}
                  <b>
                    {
                      list.filter(
                        (r) => customerRequestStage(r) === "completed",
                      ).length
                    }
                    개
                  </b>
                </span>
              </div>
              <div className="rb-project-assignees">
                <strong>담당 개발팀</strong>
                <span>
                  {[
                    ...new Map(
                      list
                        .flatMap((r) => r.assignees || [])
                        .map((m) => [m.userId, m]),
                    ).values(),
                  ]
                    .map((m) => m.displayName)
                    .join(", ") || "아직 배정된 담당자가 없어요"}
                </span>
              </div>
            </section>
            <div className="rb-client-list-heading">
              <h2>요청 리스트</h2>
              <div>
                <select
                  aria-label="요청 정렬"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="latest">최신순</option>
                  <option value="oldest">오래된순</option>
                  <option value="priority">우선순위순</option>
                </select>
                <button
                  className="rb-primary rb-desktop-request"
                  onClick={() => go(`${base}/new`)}
                >
                  ＋ 요청 작성
                </button>
              </div>
            </div>
            <div className="rb-list-toolbar">
              <input
                aria-label="요청 검색"
                placeholder="요청 제목 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="요청 상태 필터"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">전체 상태</option>
                {Object.entries(stages).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rb-request-list">
              {list
                .filter(
                  (r) =>
                    r.title.toLowerCase().includes(query.toLowerCase()) &&
                    (!filter || customerRequestStage(r) === filter),
                )
                .sort((a, b) =>
                  sort === "priority"
                    ? ["urgent", "high", "normal", "low"].indexOf(a.priority) -
                        ["urgent", "high", "normal", "low"].indexOf(
                          b.priority,
                        ) || Date.parse(b.createdAt) - Date.parse(a.createdAt)
                    : sort === "oldest"
                      ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
                      : Date.parse(b.createdAt) - Date.parse(a.createdAt),
                )
                .map((r) => (
                  <button
                    key={r.id}
                    className="rb-request-card rb-client-request-card"
                    onClick={() => go(`${base}/${r.id}`)}
                  >
                    <div className="rb-client-card-top">
                      <span
                        className={`rb-client-status ${customerRequestStage(r)}`}
                      >
                        {stages[customerRequestStage(r)]}
                      </span>
                      <time>
                        {new Date(r.createdAt).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </time>
                    </div>
                    <div className="rb-request-author">
                      <span className="rb-person-avatar" aria-hidden="true">
                        {(r.creatorName || "참여자").slice(0, 1)}
                      </span>
                      <strong>{r.creatorName || "참여자"}</strong>
                    </div>
                    <h3>{r.title}</h3>
                  </button>
                ))}
            </div>
            <button
              className="rb-client-request-fab"
              aria-label="새 요청 작성"
              onClick={() => go(`${base}/new`)}
            >
              <span aria-hidden="true">＋</span>
            </button>
            {!list.length && (
              <div className="rb-empty">
                <span>☷</span>
                <h2>아직 등록된 요청이 없어요</h2>
                <p>
                  {user.accountType === "client"
                    ? "첫 요청을 작성하고 개발팀과 이야기를 시작해보세요."
                    : "의뢰자가 요청을 등록하면 여기에 표시돼요."}
                </p>
              </div>
            )}
            {list.length > 0 &&
              !list.some(
                (r) =>
                  r.title.toLowerCase().includes(query.toLowerCase()) &&
                  (!filter || customerRequestStage(r) === filter),
              ) && <p className="rb-empty">검색 조건에 맞는 요청이 없어요.</p>}
          </>
        ) : null}
      </main>

    </div>
  );
}
