# Kinetics Hub registration modal

The Hubs app serves a small, dependency-free registration widget at:

`/kinetics-hub-registration.js`

It opens the existing `/register/:token` page in a responsive modal. The form, validation, duplicate-submission protection, success state, and registration data remain owned by the Hubs app.

## Test it internally

Open the internal preview page on the live Hubs server:

`/registration-widget-preview.html?registrationUrl=<URL-encoded-active-registration-url>`

For example, copy the active registration URL from **Hubs Setup**, URL-encode it, and append it as the `registrationUrl` query parameter. The preview shows a Kinetics-style Innovation Circle advertising card. Click **Register Now** to test the modal and submit a real test registration if desired.

Without a `registrationUrl`, the preview still tests the modal layout and close behavior, but the embedded page will show the invalid-link state.

## Add it to the Kinetics WordPress page

Replace the existing Innovation Circle registration link with a link that has the `data-kinetics-hub-register` attribute. Keep the normal `href` as a fallback for visitors who have JavaScript disabled.

```html
<a
  href="https://YOUR-HUBS-APP-URL/register/YOUR-HUB-REGISTRATION-TOKEN"
  data-kinetics-hub-register
  data-hub-title="AI Innovation Circle"
  class="your-existing-register-button"
>
  Register Now
</a>

<script
  src="https://YOUR-HUBS-APP-URL/kinetics-hub-registration.js"
  defer
></script>
```

Use the active registration URL copied from **Hubs Setup** for the `href` and `data-registration-url` values. For example:

```html
<a
  href="https://YOUR-HUBS-APP-URL/register/YOUR-HUB-REGISTRATION-TOKEN"
  data-registration-url="https://YOUR-HUBS-APP-URL/register/YOUR-HUB-REGISTRATION-TOKEN"
  data-kinetics-hub-register
  data-hub-title="AI Innovation Circle"
>
  Register Now
</a>
```

The explicit `data-registration-url` is useful when the visible link currently points to the Innovation Circle information page rather than the registration form.

## Multiple advertised Hubs

Load the script once and add the attribute to each Hub button. Each button can point to a different active registration URL:

```html
<a
  href="https://YOUR-HUBS-APP-URL/register/AI_CIRCLE_TOKEN"
  data-kinetics-hub-register
  data-hub-title="AI Innovation Circle"
>
  Register for the AI Innovation Circle
</a>

<a
  href="https://YOUR-HUBS-APP-URL/register/LEADERS_CIRCLE_TOKEN"
  data-kinetics-hub-register
  data-hub-title="Leaders Innovation Circle"
>
  Register for the Leaders Innovation Circle
</a>
```

## Optional JavaScript API

The same widget can be opened from a custom button:

```html
<button id="open-hub-registration">Register Now</button>
<script>
  document
    .getElementById("open-hub-registration")
    .addEventListener("click", function () {
      window.KineticsHubRegistration.open({
        registrationUrl: "https://YOUR-HUBS-APP-URL/register/YOUR-HUB-REGISTRATION-TOKEN",
        title: "AI Innovation Circle"
      });
    });
</script>
```

The modal closes with the close button, the Escape key, or by clicking the shaded background. On mobile it expands to a full-height sheet, while on desktop it uses a centered, contained dialog.