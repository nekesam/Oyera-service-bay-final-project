// =========================================================
// CURRENT DAY, DATE AND TIME
// =========================================================

function updateDateTime() {
    const dateTimeElement = document.getElementById("currentDateTime");

    if (!dateTimeElement) return;

    const now = new Date();

    const formattedDateTime = now.toLocaleString("en-UG", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    });

    dateTimeElement.textContent = formattedDateTime;
}


// Update immediately
updateDateTime();

// Update every minute
setInterval(updateDateTime, 60000);