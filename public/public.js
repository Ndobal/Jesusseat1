const form=document.querySelector('#contact-form');
if(form)form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]'),status=document.querySelector('#contact-status');
  button.disabled=true;status.textContent='Sending your message…';
  const body=Object.fromEntries(new FormData(form));body.consent=body.consent==='on';
  try{
    const response=await fetch('/api/public/contact',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to send. Please try again.');
    const heading=document.createElement('h2');heading.textContent='Your message is with us.';
    const description=document.createElement('p');description.textContent=data.message;
    const reference=document.createElement('strong');reference.textContent=`Reference: ${data.reference}`;
    const link=document.createElement('a');link.href='/';link.className='underlined';link.textContent='Return home ↗';
    form.replaceChildren(heading,description,reference,link);form.classList.add('contact-success');
  }catch(error){status.textContent=error.message;button.disabled=false;}
});
