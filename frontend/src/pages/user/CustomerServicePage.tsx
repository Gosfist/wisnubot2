import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import type { CustomerServiceItemModel } from "../../types/models";

const ITEMS_PER_PAGE = 5;

export function CustomerServicePage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const appData = useAppData();
  const { showToast } = useToast();
  const isOwner = true;
  const basePath =
    isOwner
      ? "/customer-service"
      : "/customer-service";

  const [items, setItems] = useState<CustomerServiceItemModel[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(!appData.customerServiceItems.length);
  const [error, setError] = useState<string | null>(null);

  async function loadItems() {
    try {
      setIsLoading(true);
      const nextItems = await appData.refreshCustomerService();
      setItems(nextItems);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Gagal memuat customer service.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [items.length, currentPage]);

  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return items.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [items, currentPage]);

  async function handleDelete(item: CustomerServiceItemModel) {
    if (item.commandName.trim().toLowerCase() === "welcome") {
      showToast('Perintah "welcome" tidak bisa dihapus.', "danger");
      return;
    }

    const confirmed = window.confirm(
      `Yakin ingin menghapus perintah "${item.commandName}"?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      const message = await appData.deleteCustomerService(item.id);
      await loadItems();
      showToast(message, "success");
    } catch (nextError) {
      showToast(
        nextError instanceof Error
          ? nextError.message
          : "Gagal menghapus customer service.",
        "danger",
      );
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customer Service"
        actions={
          <button
            className="inline-flex w-auto items-center justify-center gap-2 rounded-[16px] bg-linear-to-r from-primary to-accent px-4 py-2.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
            type="button"
            onClick={() => navigate(`${basePath}/add`)}
          >
            <Plus size={16} />
            Tambah
          </button>
        }
      />

      <SurfaceCard className="overflow-hidden">
        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center">
            <div className="size-10 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
          </div>
        ) : error ? (
          <div className="px-5 py-6 text-sm text-danger">{error}</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-6 text-sm text-text-secondary">
            Belum ada data customer service.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-glass-border bg-[rgba(15,23,42,0.42)] text-left">
                    <th className="w-[3ch] pl-5 py-3 text-xs font-bold tracking-[0.12em] text-text-muted uppercase whitespace-nowrap">
                      No
                    </th>
                    <th className="px-5 py-3 text-xs font-bold tracking-[0.12em] text-text-muted uppercase">
                      Nama Perintah
                    </th>
                    <th className="px-5 py-3 text-xs font-bold tracking-[0.12em] text-text-muted uppercase">
                      Value
                    </th>
                    <th className="w-[132px] px-5 py-3 text-right text-xs font-bold tracking-[0.12em] text-text-muted uppercase whitespace-nowrap">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item, index) => (
                    (() => {
                      const isWelcomeCommand =
                        item.commandName.trim().toLowerCase() === "welcome";

                      return (
                        <tr
                          key={item.id}
                          className="border-b border-[rgba(148,163,184,0.08)] last:border-b-0"
                        >
                          <td className="w-[3ch] pl-5 py-4 text-sm text-text-secondary whitespace-nowrap">
                            {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                          </td>
                          <td className="px-5 py-4 text-sm font-semibold text-text-primary">
                            /{isWelcomeCommand ? "start" : item.commandName}
                          </td>
                          <td className="px-5 py-4 text-sm text-text-secondary">
                            {(() => {
                              if (isWelcomeCommand) {
                                try {
                                  const parsedObj = JSON.parse(item.value);
                                  if (parsedObj.text !== undefined && Array.isArray(parsedObj.menuList)) {
                                    return (
                                      <div>
                                        <div className="whitespace-pre-wrap">{parsedObj.text}</div>
                                      </div>
                                    );
                                  }
                                } catch (e) {
                                  // is plain text
                                }
                              }
                              return <div className="whitespace-pre-wrap">{item.value}</div>;
                            })()}
                          </td>
                          <td className="w-[132px] px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(148,163,184,0.08)] text-text-secondary transition hover:bg-[rgba(148,163,184,0.14)]"
                                type="button"
                                onClick={() => navigate(`${basePath}/${item.id}`)}
                                aria-label="Edit customer service"
                                title="Edit"
                              >
                                <Pencil size={18} />
                              </button>
                              <button
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(148,163,184,0.08)] text-danger transition hover:bg-[rgba(148,163,184,0.14)]"
                                type="button"
                                onClick={() => handleDelete(item)}
                                aria-label="Hapus customer service"
                                title="Hapus"
                                disabled={isWelcomeCommand}
                              >
                                <Trash2
                                  size={18}
                                  className={isWelcomeCommand ? "opacity-40" : undefined}
                                />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })()
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-center gap-2 px-5 py-4">
                <button
                  className="rounded-[16px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-[rgba(56,189,248,0.32)] disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                  (page) => (
                    <button
                      key={page}
                      className={`rounded-[16px] px-4 py-2 text-sm font-semibold transition ${page === currentPage
                        ? "bg-linear-to-r from-primary to-accent text-white shadow-glow"
                        : "border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] text-text-primary hover:border-[rgba(56,189,248,0.32)]"
                        }`}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ),
                )}

                <button
                  className="rounded-[16px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-[rgba(56,189,248,0.32)] disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </SurfaceCard>
    </div>
  );
}
