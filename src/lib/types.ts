export type PageTreeNode = {
  id: string;
  title: string;
  slug: string;
  order: number;
  parentId: string | null;
  children: PageTreeNode[];
};

export type PageDetail = {
  id: string;
  title: string;
  slug: string;
  content: string;
  order: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};
