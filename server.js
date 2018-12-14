'use strict';

//Application Dependencies
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');


//Load env vars;
require('dotenv').config();

const PORT = process.env.PORT || 3000;

//postgres
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

//app
const app = express();
app.use(cors());

// Routes
app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/yelp', getYelp);
app.get('/movies', getMovies);

//Handlers

function getLocation(req, res){
  let query = req.query.data;
  console.log(req.query.data);
  //check DB for data
  const SQL = 'SELECT * FROM locations where search_query=$1';
  const values = [query];
  return client.query(SQL,values)
    .then(data=>{
      if (data.rowCount){
        console.log('data retrieved from DB');
        res.status(200).send(data.rows[0]);
      }else{
        console.log('data not retrieved from DB');
        return searchToLatLong(req.query.data)
          .then(locationData => {
            res.send(locationData);
          });
      }
    })
    .catch(err=>{console.error(err)});
}

function getWeather(req, res){
  return searchForWeather(req.query.data)
    .then(weatherData => {
      res.send(weatherData);
    });
}

function getYelp(req, res){
  return searchForYelp(req.query.data)
    .then(yelpData => {
      res.send(yelpData);
    });
}

function getMovies(req, res){
  return searchForMovies(req.query.data)
    .then(movieData => {
      res.send(movieData)
    });
}

//Constructor functions

function Location(location){
  this.formatted_query = location.formatted_address;
  this.latitude = location.geometry.location.lat;
  this.longitude = location.geometry.location.lng;

  this.short_name = location.address_components[0].short_name;
}

function Forecast(weather){
  this.forecast = weather.summary;
  this.time = new Date(weather.time * 1000).toDateString(); //from stack overflow "convert unix string to time"
}

function Yelp(yelp){
  this.name = yelp.name;
  this.image_url = yelp.image_url;
  this.price = yelp.price;
  this.rating = yelp.rating;
  this.url = yelp.url;
}

function Movie(movie){
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  this.image_url = 'https://image.tmdb.org/t/p/w500/' + movie.poster_path;
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
}

//Search for Resource

function searchToLatLong(query){
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODING_API_KEY}`;
  return superagent.get(url)
    .then(geoData => {
      const location = new Location(geoData.body.results[0]);
      let SQLN = `INSERT INTO locations 
        (search_query, formatted_query, latitude, longitude)
        VALUES($1, $2, $3, $4)`;
        // store it in our db
      return client.query(SQLN, [query, location.formatted_query, location.latitude, location.longitude])
        .then(() =>{
          return location;
        })
        .catch(err =>console.error(err));
    })
}

function searchForWeather(query){
  const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${query.latitude},${query.longitude}`;
  return superagent.get(url)
    .then(weatherData => {
      return weatherData.body.daily.data.map(day => {
        let weather = new Forecast(day);
        return weather;
      });
    })
    .catch(err => console.error(err));
}

function searchForYelp(query){
  const url = `https://api.yelp.com/v3/businesses/search?latitude=${query.latitude}&longitude=${query.longitude}`;
  return superagent.get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(yelpData => {
      return yelpData.body.businesses.map(meal => {
        let yelp = new Yelp(meal);
        return yelp;
      });
    })
    .catch(err => console.error(err));
}

function searchForMovies(query, req){
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${query.short_name}`;

  return superagent.get(url)
    .then(movieData => {
      //      console.log(movieData.body.results);
      return movieData.body.results.map(movie => {
        let movies = new Movie(movie);
        return movies;
      });
    })
    .catch(err => console.error(err));
}

// Error messages
app.get('/*', function(req, res) {
  res.status(404).send('you are in the wrong place');
});

function errorMessage(res){
  res.status(500).send('something went wrong');
} //created a function to handle the 500 errors but not sure what to do with it

app.listen(PORT, () => {
  console.log(`app is up on port : ${PORT}`);
})

