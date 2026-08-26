
//5.Routes
//structure of a route
// app.METHOD(PATH, HANDLER);

//routing
// app.get('/', (req, res) => { // new
//   res.send('Homepage! Hello world.');
// });

app.get('/about', (req, res) => { // new
  res.send('About page. Nice.');
});

app.post('/about', (req, res) => { // new
  res.send('We got a post request at /about.');
});

app.put('/about', (req, res) => { // new
  res.send('We got a put request at /about.');
});

app.delete('/about', (req, res) => { // new
  res.send('We got a delete request at /about.');
});

//path parameters
app.get("/pathparams/:name", (req, res) => {
res.send("My path param is " + req.params.name);
});

//querry parameters/strings they are always optional
app.get("/queryparams", (req, res) => {
res.send(
"My query params are: " + req.query.class + " and " + req.query.cohort
);

});

//serving html files
app.get("/", (req, res)=>{
  res.sendFile(__dirname + "/index.html")
})

app.get("/signup", (req, res) =>{
  res.sendFile(__dirname + "/form.html")
})

app.post("/signup", (req, res)=>{
  console.log(req.body);
})

//Time logger for all requests
// app.use((req, res, next) => {
// console.log('A new request received at ' + Date.now());
// next();
// });

app.use('/signup', (req, res, next) => {
console.log('A new request received at ' + Date.now());
next();
});