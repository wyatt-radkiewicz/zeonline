let joinBtn = document.getElementById('join');
if (joinBtn) {
  joinBtn.addEventListener("click", () => {
    const name = document.getElementById('name').value;
    const nonAlphaNumeric = /[^a-zA-Z0-9_]/;
    if (name.length >= 3 && name.length <= 16 && !nonAlphaNumeric.test(name)) {
      window.location.pathname = "/join/" + name;
    } else {
      document.getElementById("error-text").className = "";
    }
  });
}
