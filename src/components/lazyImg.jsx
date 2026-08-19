import React from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import MutableSelect from './mutableSelect';
import store from 'store';
import { useContextMenu, Menu, Item } from 'react-contexify';
import 'react-contexify/ReactContexify.css';
import axiosInstance from './axios_setup';

class LazyImage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loaded: false,
      type: this.props.type,
    };

    this.localClick = this.localClick.bind(this);
    this.otherAssignment = this.otherAssignment.bind(this);
    this.set_as_thumbnail = this.set_as_thumbnail.bind(this);
    this.get_unique_list = this.get_unique_list.bind(this);
  }

  get_unique_list() {
    var uniq_selected = [...new Set(this.props.imgsSelected)];
    const thisIdx = uniq_selected.indexOf(this.props.face_id);
    uniq_selected.splice(thisIdx, 1);
    uniq_selected = uniq_selected.concat(this.props.face_id);
    this.props.setHidden(this.props.face_id);
    this.setState({ ignored: true });

    this.props.clearImagesSelected();
    return uniq_selected;
  }

  set_as_thumbnail() {
    var thumbnail_url = store.get('api_url') + '/faces/' + this.props.face_id + '/set_as_person_thumbnail/';
    axiosInstance.put(thumbnail_url)
      .then(response => {})
      .catch(error => {
        console.log("Error in set as thumbnail");
      });
  }

  set_invisible() {
    this.setState({ ignored: true });
  }

  localClick(event) {
    this.props.onClick(event, this.props.face_id, 0);
  }

  otherAssignment() {
    this.setState({ type: 'unassigned_tab' });
  }

  render() {
    // Unique menu id per image instance to avoid collisions
    const menuId = `menu-face-${this.props.face_id}-${this.props.index}`;

    var mutable_select = <MutableSelect 
      peopleOptions={this.props.peopleOptions}
      face_id={this.props.face_id}
      current_person_id={this.props.current_person_id}
      setInvisible={(e)=>{this.set_invisible()}}
      setHidden={this.props.setHidden}
      updatePersonList={this.props.updatePersonList}
      imgsSelected={this.props.imgsSelected}
      clearImagesSelected={this.props.clearImagesSelected}
      get_unique_list={this.get_unique_list}
    />;
      
    return (
      <div className={(this.props.hidden || this.state.ignored) ? 'hidden_img' : 'imgDiv'}>
        <LazyImageContextWrapper 
          menuId={menuId}
          hidden={this.props.hidden}
          ignored={this.state.ignored}
          selected={this.props.selected}
          url={this.props.url}
          index={this.props.index}
          scrollPosition={this.props.scrollPosition}
          localClick={this.localClick}
          onDrop={this.props.onDrop}
          onDrag={this.props.onDrag}
          loaded={this.state.loaded}
          onLoad={() => this.setState({ loaded: true })}
        />
   
        <Menu id={menuId}>
          <Item onClick={ () => this.props.api_action('close_assigned', this.props.face_id) }>
            Remove from person
          </Item>
          <Item onClick={ () => this.props.api_action('close_unassigned', this.props.face_id) }>
            Send to ignore
          </Item>
          <Item onClick={ this.otherAssignment }>
            Send to other person
          </Item>
          <Item onClick={ () => this.props.api_action('verify_face', this.props.face_id) }>
            Verify face
          </Item>
          <Item onClick={ this.set_as_thumbnail }>
            Set as highlight image
          </Item>
        </Menu>
        
        {
          {
            'proposed': <button className={this.props.hidden ? 'hidden_img' : 'yes'}
                        onClick={ (e) => {this.props.api_action('confirm_proposed', this.props.face_id) } }
                        >
                        &#10003;
                        </button>,
            'unassigned_tab': mutable_select
          }[this.state.type]
        }
        {
          {
            'proposed': <button className={this.props.hidden ? 'hidden_img' : 'no'}
                        onClick={ (e)=>{this.props.api_action('close_assigned', this.props.face_id) } }
                        >
                        x
                        </button>,
            'unassigned_tab': <button className={this.props.hidden ? 'hidden_img' : 'delete'}
                                onClick={ (e)=>{this.props.api_action('close_unassigned', this.props.face_id) } }
                                >
                                x
                                </button>,
            'ignored': <button className={this.props.hidden ? 'hidden_img' : 'delete'}
                                onClick={ (e)=>{this.props.api_action('close_ignored', this.props.face_id) } }
                                >
                                x
                                </button>,
          }[this.state.type]
        }
        {this.props.ignore_tab ? (
          <React.Fragment>
            <button 
              className={this.props.hidden ? 'hidden_img' : 'delete'}
              onClick={ (e)=>{this.props.api_action('close_ignored', this.props.face_id) } }
            >
              x
            </button>
            {mutable_select}
          </React.Fragment> 
        ) : <span></span>}
      </div>
    );
  }
}

// Functional wrapper to leverage react-contexify's hook cleanly inside a Class Component
function LazyImageContextWrapper({ menuId, hidden, ignored, selected, url, index, scrollPosition, localClick, onDrop, onDrag, loaded, onLoad }) {
  const { show } = useContextMenu({ id: menuId });

  function handleContextMenu(event) {
    show({ event });
  }

  return (
    <div onContextMenu={handleContextMenu}>
      <LazyImageComponent
        hidden={hidden}
        ignored={ignored}
        selected={selected}
        url={url}
        index={index}
        scrollPosition={scrollPosition}
        localClick={localClick}
        onDrop={onDrop}
        onDrag={onDrag}
        loaded={loaded}
        onLoad={onLoad}
      />
    </div>
  );
}

function LazyImageComponent({ hidden, ignored, selected, url, index, scrollPosition, localClick, onDrop, onDrag, loaded, onLoad }) {
  return (
    <LazyLoadImage 
      className={(hidden || ignored) ? 'hidden_img' : selected ? 'img_thumb_active' : 'img_thumb'} 
      src={url} 
      key={index}
      effect='blur'
      scrollPosition={scrollPosition}
      onClick={(e) => localClick(e)}
      onDrop={onDrop}
      onDrag={onDrag}
      wrapperClassName={loaded ? 'loaded' : 'loading'}
      afterLoad={onLoad}
    />
  );
}

export default LazyImage;
