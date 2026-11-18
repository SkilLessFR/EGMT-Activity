import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  FilePlus2,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { createTemplateLog, getErrorMessage } from "../api/client";
import {
  getTemplatesByCategory,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from "../domain/taskTemplates";
import type { TemplateLogPhoto } from "../shared/types";
import { compressImageToDataUrl } from "../utils/image";
import { Modal } from "./ui/Modal";
import { Button, inputClassName } from "./ui/Primitives";
import { useToast } from "./ui/Toast";

interface TemplateLogModalProps {
  isOpen: boolean;
  shiftEmployees: string[];
  shiftLabel: string;
  onClose: () => void;
}

export function TemplateLogModal({
  isOpen,
  shiftEmployees,
  shiftLabel,
  onClose,
}: TemplateLogModalProps) {
  const { showToast } = useToast();
  const [category, setCategory] = useState<TemplateCategory>("Mega Wheel");
  const options = useMemo(() => getTemplatesByCategory(category), [category]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    () => getTemplatesByCategory("Mega Wheel")[0].id
  );

  const selectedTemplate = useMemo(
    () => options.find((o) => o.id === selectedTemplateId) ?? options[0],
    [options, selectedTemplateId]
  );

  const [studio, setStudio] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [customPerson, setCustomPerson] = useState("");
  const [oldSn, setOldSn] = useState("");
  const [newSn, setNewSn] = useState("");
  const [comment, setComment] = useState("");
  const [photosByKey, setPhotosByKey] = useState<Record<string, string>>({});
  const [compressingKey, setCompressingKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCategory("Mega Wheel");
    setSelectedTemplateId(getTemplatesByCategory("Mega Wheel")[0].id);
    setStudio("");
    setSelectedPeople([]);
    setCustomPerson("");
    setOldSn("");
    setNewSn("");
    setComment("");
    setPhotosByKey({});
    setError(null);
  }, [isOpen]);

  const handleCategoryChange = (nextCat: TemplateCategory) => {
    setCategory(nextCat);
    const first = getTemplatesByCategory(nextCat)[0];
    if (first) setSelectedTemplateId(first.id);
    setOldSn("");
    setNewSn("");
    setComment("");
    setPhotosByKey({});
    setError(null);
  };

  const handleTemplateChange = (nextId: string) => {
    setSelectedTemplateId(nextId);
    setOldSn("");
    setNewSn("");
    setComment("");
    setPhotosByKey({});
    setError(null);
  };

  const togglePerson = (name: string) => {
    setSelectedPeople((prev) =>
      prev.some((p) => p.toLowerCase() === name.toLowerCase())
        ? prev.filter((p) => p.toLowerCase() !== name.toLowerCase())
        : [...prev, name]
    );
  };

  const handleAddCustomPerson = () => {
    const trimmed = customPerson.trim();
    if (!trimmed) return;
    if (!selectedPeople.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedPeople((prev) => [...prev, trimmed]);
    }
    setCustomPerson("");
  };

  const handlePhotoUpload = async (
    photoKey: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCompressingKey(photoKey);
    setError(null);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhotosByKey((prev) => ({ ...prev, [photoKey]: dataUrl }));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCompressingKey(null);
    }
  };

  const allPeopleChoices = useMemo(() => {
    const map = new Map<string, string>();
    for (const name of [...shiftEmployees, ...selectedPeople]) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!map.has(key)) map.set(key, trimmed);
    }
    return Array.from(map.values());
  }, [shiftEmployees, selectedPeople]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!studio.trim()) {
      setError("Studio is required.");
      return;
    }
    if (selectedPeople.length === 0) {
      setError("Select at least one technician who performed this task.");
      return;
    }
    if (selectedTemplate.requiresSerialNumbers) {
      if (!oldSn.trim() || !newSn.trim()) {
        setError("Both Old roulette SN and New roulette SN are required.");
        return;
      }
    }
    if (selectedTemplate.requiresComment && !comment.trim()) {
      setError(`${selectedTemplate.commentLabel ?? "Commentary"} is required.`);
      return;
    }

    const photos: TemplateLogPhoto[] = [];
    if (selectedTemplate.requiredPhotos) {
      for (const req of selectedTemplate.requiredPhotos) {
        const dataUrl = photosByKey[req.key];
        if (!dataUrl) {
          setError(`Please upload: ${req.label}`);
          return;
        }
        photos.push({ label: req.label, dataUrl });
      }
    }

    setSubmitting(true);
    try {
      await createTemplateLog({
        templateId: selectedTemplate.id,
        category: selectedTemplate.category,
        optionName: selectedTemplate.name,
        studio: studio.trim(),
        completedBy: selectedPeople,
        ...(selectedTemplate.requiresSerialNumbers
          ? {
              oldSerialNumber: oldSn.trim(),
              newSerialNumber: newSn.trim(),
            }
          : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(photos.length > 0 ? { photos } : {}),
      });

      showToast({
        tone: "success",
        title: "Logged to History",
        description: `${selectedTemplate.category} · ${selectedTemplate.name} (Studio ${studio.trim()})`,
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create from Template"
      subtitle="Logs directly to History (not added to Daily Tasks)"
      icon={<FilePlus2 className="h-4 w-4" />}
      maxWidthClass="max-w-xl"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Category */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-300">
            Category
          </label>
          <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-white/[0.04] p-1">
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => handleCategoryChange(cat)}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  category === cat
                    ? "btn-primary-theme font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Option */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-300">
            Task Template
          </label>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {options.map((opt) => {
              const active = opt.id === selectedTemplate.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleTemplateChange(opt.id)}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                    active
                      ? "btn-primary-theme border-transparent font-semibold"
                      : "border-white/[0.08] bg-white/[0.03] text-zinc-200 hover:border-white/[0.2]"
                  }`}
                >
                  <span>{opt.name}</span>
                  <span className="flex items-center gap-1 text-[10px] opacity-75">
                    {opt.requiredPhotos && <span>Photo</span>}
                    {opt.requiresSerialNumbers && <span>SN</span>}
                    {opt.requiresComment && <span>Note</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Studio */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-300">
            Studio <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={studio}
            onChange={(e) => setStudio(e.target.value)}
            placeholder="e.g. A81, S2, 25 PWR..."
            className={inputClassName}
            required
          />
        </div>

        {/* Step 4: Serial Numbers (Roulette Change) */}
        {selectedTemplate.requiresSerialNumbers && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">
                Old roulette SN <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={oldSn}
                onChange={(e) => setOldSn(e.target.value)}
                placeholder="Enter old SN..."
                className={inputClassName}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">
                New roulette SN <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={newSn}
                onChange={(e) => setNewSn(e.target.value)}
                placeholder="Enter new SN..."
                className={inputClassName}
                required
              />
            </div>
          </div>
        )}

        {/* Step 5: Mandatory Commentary */}
        {selectedTemplate.requiresComment && (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">
              {selectedTemplate.commentLabel}{" "}
              <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={selectedTemplate.commentPlaceholder}
              className={inputClassName}
              required
            />
          </div>
        )}

        {/* Step 6: Mandatory Photos */}
        {selectedTemplate.requiredPhotos &&
          selectedTemplate.requiredPhotos.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-300">
                Required Picture{selectedTemplate.requiredPhotos.length > 1 ? "s" : ""}{" "}
                <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {selectedTemplate.requiredPhotos.map((req) => {
                  const preview = photosByKey[req.key];
                  const isCompressing = compressingKey === req.key;
                  return (
                    <div
                      key={req.key}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-zinc-300">
                        <span className="font-medium">{req.label}</span>
                        {preview && (
                          <button
                            type="button"
                            onClick={() =>
                              setPhotosByKey((prev) => {
                                const next = { ...prev };
                                delete next[req.key];
                                return next;
                              })
                            }
                            className="rounded p-0.5 text-zinc-400 hover:text-red-400"
                            aria-label={`Remove ${req.label}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {preview ? (
                        <img
                          src={preview}
                          alt={req.label}
                          className="h-28 w-full rounded-md object-cover"
                        />
                      ) : (
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.14] py-4 text-xs text-zinc-400 transition hover:border-white/[0.28] hover:text-zinc-200">
                          {isCompressing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Camera className="h-4 w-4" />
                          )}
                          <span>
                            {isCompressing ? "Compressing..." : "Upload / Take Photo"}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => void handlePhotoUpload(req.key, e)}
                            disabled={isCompressing}
                            className="sr-only"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* Step 7: Who changed it (shift technicians, multi-select) */}
        <div className="space-y-2 border-t border-white/[0.06] pt-3">
          <div className="flex items-center justify-between text-xs">
            <label className="font-medium text-zinc-300">
              Changed By ({shiftLabel}) <span className="text-red-400">*</span>
            </label>
            <span className="text-zinc-500">
              {selectedPeople.length} selected (multi-select)
            </span>
          </div>

          {allPeopleChoices.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {allPeopleChoices.map((emp) => {
                const active = selectedPeople.some(
                  (p) => p.toLowerCase() === emp.toLowerCase()
                );
                return (
                  <button
                    key={emp}
                    type="button"
                    onClick={() => togglePerson(emp)}
                    className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                        : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/[0.2]"
                    }`}
                  >
                    {active && <Check className="h-3 w-3 text-emerald-400" />}
                    <span>{emp}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              No roster loaded for today&apos;s shift — add technician name below.
            </p>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={customPerson}
              onChange={(e) => setCustomPerson(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomPerson();
                }
              }}
              placeholder="Add another technician name..."
              className={inputClassName}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddCustomPerson}
              disabled={!customPerson.trim()}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || compressingKey !== null}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Log to History
          </Button>
        </div>
      </form>
    </Modal>
  );
}
