import { getState, saveChild, deleteChild } from "../state.js";
import * as router from "../router.js";
import * as confirmDialog from "./components/confirmDialog.js";
import { showToast } from "./components/toast.js";
import { resizeAndCompress } from "../utils/image.js";
import { getPhotoObjectURL } from "../storage.js";
import { getChildById } from "../roster.js";

const GROUP_PRESETS = ["まつぼっくり", "くるみ", "くわのみ", "つぼみ", "たね"];

let editingChildId = null;
let pendingPhotoBlob = null;
let pendingPhotoRemoved = false;
let tags = [];
let previewObjectUrl = null;

export function mount(container, params) {
  editingChildId = params.childId ?? null;
  pendingPhotoBlob = null;
  pendingPhotoRemoved = false;
  const existing = editingChildId ? getChildById(getState().roster, editingChildId) : null;
  tags = existing ? [...existing.tags] : [];
  render(container, existing);
}

export function unmount() {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
}

function render(container, existing) {
  container.innerHTML = "";
  container.className = "screen screen--childEdit";

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <button class="header__back"><svg class="icon"><use href="#icon-chevron-left"></use></svg>戻る</button>
    <h1 class="header__title">${existing ? "子どもを編集" : "子どもを追加"}</h1>
    <span class="header__action" aria-hidden="true"></span>
  `;
  header.querySelector(".header__back").addEventListener("click", () => router.navigateTo("rosterList"));
  container.appendChild(header);

  const scroll = document.createElement("div");
  scroll.className = "screen-scroll";

  // Photo picker
  const photoPicker = document.createElement("div");
  photoPicker.className = "child-edit__photo-picker";

  const preview = document.createElement("div");
  preview.className = "child-edit__photo-preview";
  preview.innerHTML = '<svg class="icon"><use href="#icon-camera"></use></svg>';

  const applyExistingPhoto = () => {
    if (existing?.photoRef && !pendingPhotoRemoved) {
      getPhotoObjectURL(existing.photoRef).then((url) => {
        if (!url) return;
        previewObjectUrl = url;
        preview.innerHTML = `<img src="${url}" alt="">`;
      });
    }
  };
  applyExistingPhoto();

  const photoBtns = document.createElement("div");
  photoBtns.style.display = "flex";
  photoBtns.style.flexDirection = "column";
  photoBtns.style.gap = "8px";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.className = "hidden";
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      pendingPhotoBlob = await resizeAndCompress(file);
      pendingPhotoRemoved = false;
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = URL.createObjectURL(pendingPhotoBlob);
      preview.innerHTML = `<img src="${previewObjectUrl}" alt="">`;
    } catch (err) {
      showToast("写真の処理に失敗しました");
      console.error(err);
    }
  });

  const pickBtn = document.createElement("button");
  pickBtn.type = "button";
  pickBtn.className = "btn btn--secondary btn--sm";
  pickBtn.textContent = "写真を追加";
  pickBtn.addEventListener("click", () => fileInput.click());
  photoBtns.appendChild(pickBtn);

  if (existing?.photoRef || pendingPhotoBlob) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "link-btn link-btn--danger";
    removeBtn.textContent = "写真を削除";
    removeBtn.addEventListener("click", () => {
      pendingPhotoBlob = null;
      pendingPhotoRemoved = true;
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
      preview.innerHTML = '<svg class="icon"><use href="#icon-camera"></use></svg>';
    });
    photoBtns.appendChild(removeBtn);
  }

  photoPicker.appendChild(preview);
  photoPicker.appendChild(photoBtns);
  photoPicker.appendChild(fileInput);
  scroll.appendChild(photoPicker);

  const note = document.createElement("p");
  note.className = "settings-row__desc";
  note.textContent = "写真がない子ほど、名前での識別が頼りになります。可能であれば登録をおすすめします。";
  scroll.appendChild(note);

  // Name field
  const nameField = document.createElement("div");
  nameField.className = "field";
  nameField.innerHTML = '<label for="child-name">名前 *</label>';
  const nameInput = document.createElement("input");
  nameInput.id = "child-name";
  nameInput.type = "text";
  nameInput.value = existing?.name ?? "";
  nameInput.placeholder = "たなか たろう";
  nameField.appendChild(nameInput);
  scroll.appendChild(nameField);

  // Tags field
  const tagField = document.createElement("div");
  tagField.className = "field";
  tagField.innerHTML = "<label>グループ</label>";
  const tagList = document.createElement("div");
  tagList.className = "tag-list";
  scroll.appendChild(tagField);
  tagField.appendChild(tagList);

  function renderTags() {
    tagList.innerHTML = "";
    for (const tag of tags) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip chip--tappable";
      chip.textContent = `${tag} ×`;
      chip.addEventListener("click", () => {
        tags = tags.filter((t) => t !== tag);
        renderTags();
      });
      tagList.appendChild(chip);
    }
    for (const preset of GROUP_PRESETS) {
      if (tags.includes(preset)) continue;
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "chip chip--tappable";
      addBtn.innerHTML = `<svg class="icon" style="width:14px;height:14px"><use href="#icon-plus"></use></svg>${preset}`;
      addBtn.addEventListener("click", () => {
        tags = [...tags, preset];
        renderTags();
      });
      tagList.appendChild(addBtn);
    }
  }
  renderTags();

  container.appendChild(scroll);

  if (existing) {
    const deleteRow = document.createElement("div");
    deleteRow.style.textAlign = "center";
    deleteRow.style.padding = "0 var(--space-4)";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "link-btn link-btn--danger";
    deleteBtn.textContent = "この子を名簿から削除";
    deleteBtn.addEventListener("click", () => {
      confirmDialog.confirm({
        title: "名簿から削除しますか?",
        message: "名簿から削除しても、過去の点呼記録は残ります。",
        confirmLabel: "削除する",
        danger: true,
        onConfirm: () => {
          deleteChild(existing.childId);
          router.navigateTo("rosterList");
        },
      });
    });
    deleteRow.appendChild(deleteBtn);
    scroll.appendChild(deleteRow);
  }

  const footer = document.createElement("div");
  footer.className = "sticky-footer";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn--primary btn--block";
  saveBtn.textContent = "保存する";
  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      showToast("名前を入力してください");
      return;
    }
    saveBtn.disabled = true;
    const result = await saveChild({
      childId: existing?.childId,
      name,
      tags,
      photoBlob: pendingPhotoBlob,
      removePhoto: pendingPhotoRemoved,
    });
    if (!result.ok) {
      showToast("保存に失敗しました。空き容量を確認してください");
      saveBtn.disabled = false;
      return;
    }
    if (result.photoError) {
      showToast("写真の保存に失敗しました。名前のみで登録します");
    }
    router.navigateTo("rosterList");
  });
  footer.appendChild(saveBtn);
  container.appendChild(footer);
}
