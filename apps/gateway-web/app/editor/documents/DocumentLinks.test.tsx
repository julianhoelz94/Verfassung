import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentLinks } from './DocumentLinks';
import { DocumentManager } from './DocumentManager';
import { currentUser } from '../../../lib/session';
import { listDocumentLinkEvents, listDocumentLinks, listLibraryDocuments, listDocumentFolders } from '../../../lib/document-api';

vi.mock('../../../lib/server-locale', () => ({ currentLocale: async () => 'en' }));
vi.mock('../../../lib/session', () => ({ currentUser: vi.fn(), requireSessionBearer: async () => 'Bearer session' }));
vi.mock('../../../lib/document-api', () => ({ listDocumentLinkEvents: vi.fn(), listDocumentLinks: vi.fn(), listLibraryDocuments: vi.fn(), listDocumentFolders: vi.fn() }));
vi.mock('./DocumentManager', () => ({ DocumentManager: vi.fn(() => null) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentUser).mockResolvedValue({ id: 'editor', email: 'editor@example.test', roles: ['editor'] });
  vi.mocked(listDocumentFolders).mockResolvedValue([]);
  vi.mocked(listDocumentLinkEvents).mockResolvedValue([]);
  vi.mocked(listDocumentLinks).mockResolvedValue([]);
  vi.mocked(listLibraryDocuments).mockResolvedValue({ items: [], total: 100, offset: 0, limit: 30 });
});

describe('embedded library loading', () => {
  it.each(['import_job', 'setup_proposal', 'migration_run'] as const)('keeps %s evidence scoped and restricts writes to editors/admins', async targetType => {
    const props = { targetType, targetId: 'owner', returnTo: '/admin/import', canEdit: true };
    for (const role of ['reviewer', 'publisher', 'editor', 'admin']) {
      vi.mocked(currentUser).mockResolvedValue({ id: role, email: `${role}@example.test`, roles: [role] });
      const element = await DocumentLinks(props);
      const manager = element.props.children.find((child: { type?: unknown }) => child?.type === DocumentManager);
      expect(manager.props).toMatchObject({ targetType, targetId: 'owner', canEdit: ['editor', 'admin'].includes(role), canCreate: ['editor', 'admin'].includes(role) });
      expect(listDocumentLinks).toHaveBeenLastCalledWith(targetType, 'owner', undefined, 'Bearer session');
    }
  });
  it('lets publishers select existing event sources while keeping uploads restricted', async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'publisher', email: 'publisher@example.test', roles: ['publisher'] });
    const element = await DocumentLinks({ targetType: 'lifecycle_material', targetId: 'constitution', scopeRevisionId: 'event', returnTo: '/editor/lifecycle/constitution', canEdit: true });
    const manager = element.props.children.find((child: { type?: unknown }) => child?.type === DocumentManager);
    expect(manager.props).toMatchObject({ canEdit: true, canCreate: false, targetType: 'lifecycle_material', scopeRevisionId: 'event' });
    expect(listLibraryDocuments).toHaveBeenCalled();
  });

  it('loads published record materials without a session or private library requests', async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    const element = await DocumentLinks({ targetType: 'change_material', targetId: 'amendment', scopeRevisionId: 'change', returnTo: '/', canEdit: false });
    const manager = element.props.children.find((child: { type?: unknown }) => child?.type === DocumentManager);
    expect(manager.props).toMatchObject({ canEdit: false, canCreate: false });
    expect(listDocumentLinks).toHaveBeenCalledWith('change_material', 'amendment', 'change', undefined);
    expect(listLibraryDocuments).not.toHaveBeenCalled(); expect(listDocumentLinkEvents).not.toHaveBeenCalled();
  });
  it('loads one bounded library page without eagerly loading any revision histories', async () => {
    const element = await DocumentLinks({ targetType: 'amendment', targetId: 'law', scopeRevisionId: 'draft', returnTo: '/editor', canEdit: true });
    expect(listLibraryDocuments).toHaveBeenCalledWith({ status: 'active', offset: 0, limit: 30, sort: 'title' }, 'Bearer session');
    const manager = element.props.children.find((child: { type?: unknown }) => child?.type === DocumentManager);
    expect(manager.props).toMatchObject({ revisions: {}, remoteSearch: true, documentTotal: 100, canEdit: true });
  });

  it('keeps publisher-only views read-only even when the parent supplied editing access', async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'publisher', email: 'publisher@example.test', roles: ['publisher'] });
    const element = await DocumentLinks({ targetType: 'amendment', targetId: 'law', scopeRevisionId: 'draft', returnTo: '/editor', canEdit: true });
    expect(listLibraryDocuments).not.toHaveBeenCalled();
    const manager = element.props.children.find((child: { type?: unknown }) => child?.type === DocumentManager);
    expect(manager.props.canEdit).toBe(false);
    expect(listDocumentLinks).toHaveBeenCalledWith('amendment', 'law', 'draft', 'Bearer session');
  });
});
