export type PageTreeNode = {
  id: string;
  title: string;
  slug: string;
  order: number;
  parentId: string | null;
  children: PageTreeNode[];
};

export const PAGE_STATUSES = ["draft", "in_review", "changes_requested", "approved"] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

export type PageDetail = {
  id: string;
  title: string;
  slug: string;
  content: string;
  order: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  folderId: string | null;
  description: string;
  tags: string[];
  owner: string;
  status: PageStatus;
  reviewer: string;
  version: number;
};

/** A document as it appears in lists (no content body). */
export type PageSummary = Omit<PageDetail, "content"> & {
  folderName: string | null;
  /** Bytes of Markdown plus all attachments. */
  size: number;
  attachmentCount: number;
};

export type PageRef = { id: string; title: string };

/** Everything the document viewer needs in one request. */
export type PageFull = PageDetail & {
  folderPath: FolderRef[];
  parent: PageRef | null;
  children: PageRef[];
};

export type FolderRef = { id: string; name: string };

export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  documentCount: number;
  createdAt: string;
};

export type PageVersion = {
  id: string;
  pageId: string;
  version: number;
  title: string;
  author: string;
  note: string;
  createdAt: string;
};

export type PageVersionDetail = PageVersion & { content: string };

export const APPROVAL_ACTIONS = ["submitted", "approved", "changes_requested", "reopened"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export type ApprovalEvent = {
  id: string;
  pageId: string;
  pageTitle?: string;
  action: ApprovalAction;
  actor: string;
  comment: string;
  createdAt: string;
};

export type AttachmentKind = "image" | "diagram" | "file";

export type Attachment = {
  id: string;
  pageId: string;
  kind: AttachmentKind;
  filename: string;
  mimeType: string;
  size: number;
  caption: string;
  url: string;
  createdAt: string;
};

export type Template = {
  id: string;
  name: string;
  description: string;
  category: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type Settings = {
  workspaceName: string;
  displayName: string;
};

export type DashboardData = {
  stats: {
    documents: number;
    documentsThisWeek: number;
    folders: number;
    pendingApprovals: number;
    changesRequested: number;
    attachments: number;
    diagrams: number;
    files: number;
  };
  recent: PageSummary[];
  awaitingReview: PageSummary[];
  activity: ApprovalEvent[];
};
