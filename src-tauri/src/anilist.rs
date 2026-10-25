//! AniList lookup. A text model cannot hand back image bytes, so covers and the
//! creator fields come from AniList's public GraphQL API, which needs no key. Only the
//! title is sent. Artwork is returned as a data URI so the database stays one file.

use reqwest::blocking::Client;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::time::Duration;

const ENDPOINT: &str = "https://graphql.anilist.co";
const MAX_COVER_BYTES: usize = 400_000;
const MAX_CHAIN: usize = 12;
const MAX_DESCRIPTION: usize = 1200;

const QUERY: &str = r#"
query ($search: String) {
  Page(perPage: 1) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { romaji english }
      description(asHtml: false)
      seasonYear
      format
      episodes
      coverImage { large }
      studios(isMain: true) { nodes { name } }
      genres
      staff(perPage: 12, sort: [RELEVANCE]) {
        edges { role node { name { full } } }
      }
      relations {
        edges {
          relationType
          node {
            id
            type
            format
            episodes
            seasonYear
            coverImage { large }
            title { romaji english }
          }
        }
      }
    }
  }
}
"#;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonArt {
    number: u32,
    episodes: Option<u32>,
    cover: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Details {
    title: String,
    year: Option<i64>,
    format: String,
    description: Option<String>,
    studio: Option<String>,
    author: Option<String>,
    genres: Option<String>,
    cover: Option<String>,
    seasons: Vec<SeasonArt>,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("anime-media-library/0.1")
        .build()
        .map_err(|error| format!("Could not start the request: {error}"))
}

fn title_of(node: &Value) -> String {
    let title = &node["title"];
    ["english", "romaji"]
        .iter()
        .find_map(|key| title.get(*key).and_then(Value::as_str))
        .unwrap_or("Unknown title")
        .to_string()
}

fn format_label(raw: Option<&str>) -> String {
    match raw.unwrap_or("TV") {
        "MOVIE" => "Movie",
        "OVA" => "OVA",
        "ONA" => "ONA",
        "SPECIAL" | "TV_SHORT" => "Special",
        _ => "TV",
    }
    .to_string()
}

/// AniList descriptions carry light HTML; the panel shows plain text.
fn plain(markdown: &str) -> String {
    let mut out = String::with_capacity(markdown.len());
    let mut inside = false;
    for character in markdown.chars() {
        match character {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => out.push(character),
            _ => {}
        }
    }
    let decoded = out
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#039;", "'")
        .replace("&mdash;", "-")
        .replace("&ndash;", "-")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    let collapsed = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() > MAX_DESCRIPTION {
        let cut: String = collapsed.chars().take(MAX_DESCRIPTION).collect();
        format!("{}…", cut.trim_end())
    } else {
        collapsed
    }
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0] as u32;
        let second = chunk.get(1).copied().unwrap_or(0) as u32;
        let third = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (first << 16) | (second << 8) | third;
        out.push(TABLE[(triple >> 18) as usize & 63] as char);
        out.push(TABLE[(triple >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(triple >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[triple as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

fn cover_data_uri(
    client: &Client,
    url: Option<&str>,
    cache: &mut HashMap<String, Option<String>>,
) -> Option<String> {
    let url = url?;
    if let Some(cached) = cache.get(url) {
        return cached.clone();
    }
    let fetched = (|| {
        let response = client.get(url).send().ok()?;
        if !response.status().is_success() {
            return None;
        }
        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .filter(|value| value.starts_with("image/"))
            .unwrap_or("image/jpeg")
            .to_string();
        if let Some(length) = response.content_length() {
            if length as usize > MAX_COVER_BYTES {
                return None;
            }
        }
        let bytes = response.bytes().ok()?;
        if bytes.is_empty() || bytes.len() > MAX_COVER_BYTES {
            return None;
        }
        Some(format!("data:{mime};base64,{}", base64(&bytes)))
    })();
    cache.insert(url.to_string(), fetched.clone());
    fetched
}

fn collect_relations(
    media: &Value,
    prequels: &mut HashMap<i64, Vec<Value>>,
    sequels: &mut HashMap<i64, Vec<Value>>,
) {
    let id = media["id"].as_i64().unwrap_or_default();
    let Some(edges) = media["relations"]["edges"].as_array() else {
        return;
    };
    for edge in edges {
        let node = &edge["node"];
        if node["type"].as_str() != Some("ANIME") {
            continue;
        }
        // Only series entries belong in a season chain. Specials, OVAs and movies would
        // shift every season number once, which puts the wrong art on each row.
        if !matches!(node["format"].as_str(), Some("TV") | Some("TV_SHORT")) {
            continue;
        }
        match edge["relationType"].as_str().unwrap_or_default() {
            "PREQUEL" => prequels.entry(id).or_default().push(node.clone()),
            "SEQUEL" => sequels.entry(id).or_default().push(node.clone()),
            _ => {}
        }
    }
}

/// Walks PREQUEL back to the first entry, then SEQUEL forward, so season numbers follow
/// the franchise order rather than whichever entry the search happened to return.
fn ordered_chain(start: &Value) -> Vec<Value> {
    let mut prequels: HashMap<i64, Vec<Value>> = HashMap::new();
    let mut sequels: HashMap<i64, Vec<Value>> = HashMap::new();
    collect_relations(start, &mut prequels, &mut sequels);

    let mut seen: HashSet<i64> = HashSet::new();
    seen.insert(start["id"].as_i64().unwrap_or_default());
    let mut first = start.clone();
    for _ in 0..MAX_CHAIN {
        let id = first["id"].as_i64().unwrap_or_default();
        let Some(node) = prequels.get(&id).and_then(|nodes| nodes.first()).cloned() else {
            break;
        };
        if !seen.insert(node["id"].as_i64().unwrap_or_default()) {
            break;
        }
        collect_relations(&node, &mut prequels, &mut sequels);
        first = node;
    }

    let mut chain = vec![first.clone()];
    let mut current = first;
    for _ in 0..MAX_CHAIN {
        let id = current["id"].as_i64().unwrap_or_default();
        let Some(node) = sequels.get(&id).and_then(|nodes| nodes.first()).cloned() else {
            break;
        };
        if !seen.insert(node["id"].as_i64().unwrap_or_default()) {
            break;
        }
        collect_relations(&node, &mut prequels, &mut sequels);
        chain.push(node.clone());
        current = node;
    }
    chain
}

fn studio_of(media: &Value) -> Option<String> {
    media["studios"]["nodes"]
        .as_array()?
        .first()
        .and_then(|node| node["name"].as_str())
        .map(str::to_string)
}

fn author_of(media: &Value) -> Option<String> {
    let edges = media["staff"]["edges"].as_array()?;
    let preferred = ["Original Creator", "Original Story", "Original Character Design"];
    for wanted in preferred {
        for edge in edges {
            let role = edge["role"].as_str().unwrap_or_default();
            if role.contains(wanted) {
                if let Some(name) = edge["node"]["name"]["full"].as_str() {
                    return Some(name.to_string());
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn anilist_lookup(title: String) -> Result<Option<Details>, String> {
    let client = client()?;
    let response = client
        .post(ENDPOINT)
        .json(&json!({ "query": QUERY, "variables": { "search": title } }))
        .send()
        .map_err(|error| format!("AniList could not be reached: {error}"))?;

    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("AniList is rate limiting. Wait a minute and try again.".into());
    }
    if !response.status().is_success() {
        return Err(format!("AniList answered {}.", response.status()));
    }

    let body: Value = response
        .json()
        .map_err(|error| format!("AniList sent something unreadable: {error}"))?;
    if body.get("errors").is_some() {
        return Err("AniList rejected the search.".into());
    }
    let media = &body["data"]["Page"]["media"];
    let Some(media) = media.as_array().and_then(|items| items.first()) else {
        return Ok(None);
    };
    if media["id"].as_i64().is_none() {
        return Ok(None);
    }

    let mut cache: HashMap<String, Option<String>> = HashMap::new();
    let chain = ordered_chain(media);
    let mut seasons = Vec::new();
    for (index, node) in chain.iter().enumerate() {
        seasons.push(SeasonArt {
            number: index as u32 + 1,
            episodes: node["episodes"].as_u64().map(|value| value as u32),
            cover: cover_data_uri(&client, node["coverImage"]["large"].as_str(), &mut cache),
        });
    }

    let description = media["description"]
        .as_str()
        .map(plain)
        .filter(|value| !value.is_empty());
    let genres = media["genres"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .take(5)
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|value| !value.is_empty());

    Ok(Some(Details {
        title: title_of(media),
        year: media["seasonYear"].as_i64(),
        format: format_label(media["format"].as_str()),
        description,
        studio: studio_of(media),
        author: author_of(media),
        genres,
        cover: cover_data_uri(&client, media["coverImage"]["large"].as_str(), &mut cache),
        seasons,
    }))
}
