const form = document.querySelector("#checkout-form");
const status = document.querySelector("#order-status");

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const coupon = String(data.get("coupon") || "").trim();

  if (!email.includes("@")) {
    status.textContent = "Enter a valid email";
    return;
  }

  status.textContent = coupon ? "Order confirmed with coupon" : "Order confirmed";
});
