"use strict";

const { createClient } = supabase;

const client = createClient(
  window.APP_CONFIG.supabaseUrl,
  window.APP_CONFIG.supabaseKey
);

const state = {
  selectedDate: "2026-08-01",
  selectedSlot: null,
  slots: []
};

const elements = {
  tabs: document.querySelectorAll(".date-tab"),
  slots: document.querySelector("#time-slots"),
  loading: document.querySelector("#loading"),
  refreshButton: document.querySelector("#refresh-button"),
  statusMessage: document.querySelector("#status-message"),
  modal: document.querySelector("#modal"),
  selectedTime: document.querySelector("#selected-time"),
  form: document.querySelector("#booking-form"),
  firstName: document.querySelector("#first-name"),
  hasPartner: document.querySelector("#has-partner"),
  partnerGroup: document.querySelector("#partner-group"),
  partnerName: document.querySelector("#partner-name"),
  formError: document.querySelector("#form-error"),
  submitButton: document.querySelector("#submit-button")
};

function formatTime(value) {
  return value.slice(0, 5).replace(":", ".");
}

function getAvailability(slot) {
  const names = [slot.name_1, slot.name_2].filter(Boolean);
  const available = 2 - names.length;

  if (slot.is_closed || available === 0) {
    return {
      available: 0,
      label: slot.is_closed ? "Lukket" : "Fuldt booket",
      className: "full"
    };
  }

  if (available === 1) {
    return {
      available: 1,
      label: "1 ledig plads",
      className: "partial"
    };
  }

  return {
    available: 2,
    label: "2 ledige pladser",
    className: "open"
  };
}

function createPersonSlot(name) {
  const div = document.createElement("div");
  div.className = `person-slot${name ? "" : " empty"}`;
  div.textContent = name || "Ledig plads";
  return div;
}

function renderSlots() {
  elements.slots.replaceChildren();

  const filteredSlots = state.slots.filter(
    (slot) => slot.event_date === state.selectedDate
  );

  if (filteredSlots.length === 0) {
    const message = document.createElement("p");
    message.textContent = "Der er endnu ikke oprettet tider denne dag.";
    elements.slots.append(message);
    return;
  }

  filteredSlots.forEach((slot) => {
    const availability = getAvailability(slot);

    const article = document.createElement("article");
    article.className =
      `time-slot${availability.available === 0 ? " full" : ""}`;

    const header = document.createElement("div");
    header.className = "slot-header";

    const time = document.createElement("h3");
    time.className = "slot-time";
    time.textContent =
      `${formatTime(slot.start_time)}–${formatTime(slot.end_time)}`;

    const badge = document.createElement("span");
    badge.className = `availability ${availability.className}`;
    badge.textContent = availability.label;

    header.append(time, badge);

    const people = document.createElement("div");
    people.className = "people";
    people.append(
      createPersonSlot(slot.name_1),
      createPersonSlot(slot.name_2)
    );

    article.append(header, people);

    if (availability.available > 0) {
      const button = document.createElement("button");
      button.className = "button button-primary";
      button.type = "button";
      button.textContent =
        availability.available === 1
          ? "Book ledig plads"
          : "Vælg tidspunkt";

      button.addEventListener("click", () => openModal(slot));
      article.append(button);
    }

    elements.slots.append(article);
  });
}

async function loadSlots() {
  elements.loading.hidden = false;
  elements.refreshButton.disabled = true;

  const { data, error } = await client
    .from("time_slots")
    .select("*")
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });

  elements.loading.hidden = true;
  elements.refreshButton.disabled = false;

  if (error) {
    console.error(error);
    elements.slots.innerHTML =
      "<p>Vagtplanen kunne ikke hentes. Prøv at opdatere siden.</p>";
    return;
  }

  state.slots = data;
  renderSlots();
}

function openModal(slot) {
  state.selectedSlot = slot;

  const availability = getAvailability(slot);

  elements.selectedTime.textContent =
    `${formatTime(slot.start_time)}–${formatTime(slot.end_time)}`;

  elements.firstName.value = "";
  elements.partnerName.value = "";
  elements.hasPartner.checked = false;
  elements.partnerGroup.classList.add("hidden");
  elements.formError.textContent = "";

  // En makker kan kun tilføjes, hvis begge pladser stadig er ledige.
  const partnerChoice = elements.hasPartner.closest(".partner-choice");

  if (availability.available === 2) {
    partnerChoice.classList.remove("hidden");
  } else {
    partnerChoice.classList.add("hidden");
  }

  elements.modal.classList.add("open");
  elements.modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  window.setTimeout(() => elements.firstName.focus(), 50);
}

function closeModal() {
  elements.modal.classList.remove("open");
  elements.modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  state.selectedSlot = null;
}

function showSuccess(message) {
  elements.statusMessage.textContent = `✓ ${message}`;
  elements.statusMessage.classList.add("visible");

  window.setTimeout(() => {
    elements.statusMessage.classList.remove("visible");
  }, 5000);
}

async function submitBooking(event) {
  event.preventDefault();

  if (!state.selectedSlot) {
    return;
  }

  const firstName = elements.firstName.value.trim();
  const partnerName = elements.hasPartner.checked
    ? elements.partnerName.value.trim()
    : null;

  if (firstName.length < 2) {
    elements.formError.textContent = "Skriv venligst dit navn.";
    return;
  }

  if (elements.hasPartner.checked && partnerName.length < 2) {
    elements.formError.textContent =
      "Skriv venligst din makkers navn.";
    return;
  }

  elements.formError.textContent = "";
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "Gemmer…";

  const { error } = await client.rpc("book_time_slot", {
    selected_slot_id: state.selectedSlot.id,
    first_name: firstName,
    partner_name: partnerName || null
  });

  elements.submitButton.disabled = false;
  elements.submitButton.textContent = "Bekræft booking";

  if (error) {
    console.error(error);

    if (error.message.includes("ikke længere")) {
      elements.formError.textContent =
        "En anden nåede at tage pladsen. Vagtplanen opdateres nu.";
    } else if (error.message.includes("fuldt booket")) {
      elements.formError.textContent =
        "Tidsrummet er blevet fuldt booket.";
    } else {
      elements.formError.textContent =
        error.message || "Bookingen kunne ikke gemmes.";
    }

    await loadSlots();
    return;
  }

  closeModal();
  await loadSlots();

  showSuccess(
    partnerName
      ? `${firstName} og ${partnerName} er skrevet på.`
      : `${firstName} er skrevet på.`
  );
}

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.selectedDate = tab.dataset.date;

    elements.tabs.forEach((currentTab) => {
      const isActive = currentTab === tab;
      currentTab.classList.toggle("active", isActive);
      currentTab.setAttribute("aria-selected", String(isActive));
    });

    renderSlots();
  });
});

elements.hasPartner.addEventListener("change", () => {
  const showPartner = elements.hasPartner.checked;

  elements.partnerGroup.classList.toggle("hidden", !showPartner);
  elements.partnerName.required = showPartner;

  if (showPartner) {
    elements.partnerName.focus();
  } else {
    elements.partnerName.value = "";
  }
});

elements.form.addEventListener("submit", submitBooking);
elements.refreshButton.addEventListener("click", loadSlots);

document.querySelectorAll("[data-close-modal]").forEach((element) => {
  element.addEventListener("click", closeModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.modal.classList.contains("open")) {
    closeModal();
  }
});

loadSlots();
